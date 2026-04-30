package llm

// defaultTemp returns a sensible temperature default.
func defaultTemp(t float64) float64 {
	if t == 0 {
		return 0.7
	}
	return t
}

// defaultMaxTokens returns a sensible max_tokens default.
func defaultMaxTokens(n int) int {
	if n == 0 {
		return 4096
	}
	return n
}
