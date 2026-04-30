package llm

import "context"

// MessageRole represents the role of a message in the conversation.
type MessageRole string

const (
	RoleSystem    MessageRole = "system"
	RoleUser      MessageRole = "user"
	RoleAssistant MessageRole = "assistant"
)

// Message is a single message in the conversation.
type Message struct {
	Role    MessageRole `json:"role"`
	Content string      `json:"content"`
}

// LLMRequest holds all parameters for a generation call.
type LLMRequest struct {
	TenantID    string    `json:"tenant_id"`
	TaskType    string    `json:"task_type"`
	Model       string    `json:"model,omitempty"`
	Messages    []Message `json:"messages"`
	Temperature float64   `json:"temperature,omitempty"`
	MaxTokens   int       `json:"max_tokens,omitempty"`
	System      string    `json:"system,omitempty"`
}

// LLMChunk is a single streamed chunk from the provider.
type LLMChunk struct {
	Content string `json:"content"`
	Done    bool   `json:"done"`
}

// LLMResponse is the final aggregated response.
type LLMResponse struct {
	Content string `json:"content"`
	Model   string `json:"model"`
	Usage   Usage  `json:"usage"`
}

// Usage tracks token consumption.
type Usage struct {
	PromptTokens     int `json:"prompt_tokens"`
	CompletionTokens int `json:"completion_tokens"`
	TotalTokens      int `json:"total_tokens"`
}

// StreamFunc is called for every chunk received from the provider.
type StreamFunc func(chunk LLMChunk) error

// LLMProvider is the contract every LLM connector must implement.
type LLMProvider interface {
	// Generate streams chunks to the provided callback and returns the final response.
	Generate(ctx context.Context, req LLMRequest, stream StreamFunc) (*LLMResponse, error)
	// Name returns the provider identifier (e.g. "claude", "openai").
	Name() string
}
