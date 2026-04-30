package llm

const kimiAPI = "https://api.moonshot.cn/v1/chat/completions"

// KimiProvider implements LLMProvider for Moonshot (Kimi) using the OpenAI-compatible interface.
type KimiProvider struct {
	*OpenAIProvider
}

// NewKimiProvider creates a new Kimi provider.
func NewKimiProvider(apiKey string) *KimiProvider {
	return &KimiProvider{
		OpenAIProvider: NewOpenAIProviderWithBaseURL(apiKey, kimiAPI),
	}
}

func (p *KimiProvider) Name() string { return "kimi" }
