package llm

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
)

const openaiAPI = "https://api.openai.com/v1/chat/completions"

// OpenAIProvider implements LLMProvider for OpenAI.
type OpenAIProvider struct {
	apiKey string
	baseURL string
	client *http.Client
}

// NewOpenAIProvider creates a new OpenAI provider.
func NewOpenAIProvider(apiKey string) *OpenAIProvider {
	return &OpenAIProvider{
		apiKey:  apiKey,
		baseURL: openaiAPI,
		client:  &http.Client{},
	}
}

// NewOpenAIProviderWithBaseURL creates a provider with a custom base URL (used by Groq).
func NewOpenAIProviderWithBaseURL(apiKey, baseURL string) *OpenAIProvider {
	return &OpenAIProvider{
		apiKey:  apiKey,
		baseURL: baseURL,
		client:  &http.Client{},
	}
}

func (p *OpenAIProvider) Name() string { return "openai" }

func (p *OpenAIProvider) Generate(ctx context.Context, req LLMRequest, stream StreamFunc) (*LLMResponse, error) {
	model := req.Model
	if model == "" {
		model = "gpt-4o-mini"
	}

	messages := make([]openAIMessage, 0, len(req.Messages))
	if req.System != "" {
		messages = append(messages, openAIMessage{Role: "system", Content: req.System})
	}
	for _, m := range req.Messages {
		messages = append(messages, openAIMessage{Role: string(m.Role), Content: m.Content})
	}

	body := openAIRequest{
		Model:       model,
		Messages:    messages,
		Temperature: defaultTemp(req.Temperature),
		MaxTokens:   defaultMaxTokens(req.MaxTokens),
		Stream:      true,
	}

	b, err := json.Marshal(body)
	if err != nil {
		return nil, err
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, p.baseURL, bytes.NewReader(b))
	if err != nil {
		return nil, err
	}
	httpReq.Header.Set("Authorization", "Bearer "+p.apiKey)
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := p.client.Do(httpReq)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		bodyBytes, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("openai api error %d: %s", resp.StatusCode, string(bodyBytes))
	}

	var result LLMResponse
	result.Model = model

	reader := bufio.NewReader(resp.Body)
	for {
		line, err := reader.ReadString('\n')
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, err
		}
		line = strings.TrimSpace(line)
		if !strings.HasPrefix(line, "data: ") {
			continue
		}
		data := strings.TrimPrefix(line, "data: ")
		if data == "[DONE]" {
			if stream != nil {
				_ = stream(LLMChunk{Done: true})
			}
			break
		}

		var event openAIStreamEvent
		if err := json.Unmarshal([]byte(data), &event); err != nil {
			continue
		}

		if len(event.Choices) > 0 {
			delta := event.Choices[0].Delta.Content
			if delta != "" {
				chunk := LLMChunk{Content: delta}
				if stream != nil {
					if err := stream(chunk); err != nil {
						return nil, err
					}
				}
				result.Content += delta
			}
			if event.Choices[0].FinishReason != "" {
				if stream != nil {
					_ = stream(LLMChunk{Done: true})
				}
				break
			}
		}
	}

	return &result, nil
}

type openAIMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type openAIRequest struct {
	Model       string          `json:"model"`
	Messages    []openAIMessage `json:"messages"`
	Temperature float64         `json:"temperature,omitempty"`
	MaxTokens   int             `json:"max_tokens,omitempty"`
	Stream      bool            `json:"stream"`
}

type openAIStreamEvent struct {
	Choices []struct {
		Delta        struct {
			Content string `json:"content"`
		} `json:"delta"`
		FinishReason string `json:"finish_reason"`
	} `json:"choices"`
}
