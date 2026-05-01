package media

import "strings"

// Resolver turns a tenant-scoped media filename into a public URL.
type Resolver interface {
	ResolveURL(tenantID, filename string) string
}

// LocalResolver returns URLs served by the local media handler.
type LocalResolver struct {
	baseURL string
}

func NewLocalResolver(baseURL string) Resolver {
	return &LocalResolver{baseURL: strings.TrimSuffix(baseURL, "/")}
}

func (r *LocalResolver) ResolveURL(tenantID, filename string) string {
	return r.baseURL + "/api/media/" + tenantID + "/" + filename
}
