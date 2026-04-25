package middleware

import (
	"context"

	"github.com/rush-maestro/rush-maestro/internal/domain"
)

type contextKey string

const contextKeyUserClaims contextKey = "user_claims"

func UserClaimsFromContext(ctx context.Context) *domain.UserClaims {
	claims, _ := ctx.Value(contextKeyUserClaims).(*domain.UserClaims)
	return claims
}

func withUserClaims(ctx context.Context, claims *domain.UserClaims) context.Context {
	return context.WithValue(ctx, contextKeyUserClaims, claims)
}
