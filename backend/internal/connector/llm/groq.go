package llm

const groqAPI = "https://api.groq.com/openai/v1/chat/completions"

// GroqProvider implements LLMProvider for Groq using the OpenAI-compatible interface.
type GroqProvider struct {
	*OpenAIProvider
}

// NewGroqProvider creates a new Groq provider.
func NewGroqProvider(apiKey string) *GroqProvider {
	return &GroqProvider{
		OpenAIProvider: NewOpenAIProviderWithBaseURL(apiKey, groqAPI),
	}
}

func (p *GroqProvider) Name() string { return "groq" }
