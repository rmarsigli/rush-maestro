package domain

import "time"

type PostStatus string

const (
	PostStatusDraft     PostStatus = "draft"
	PostStatusApproved  PostStatus = "approved"
	PostStatusScheduled PostStatus = "scheduled"
	PostStatusPublished PostStatus = "published"
)

var ValidTransitions = map[PostStatus][]PostStatus{
	PostStatusDraft:     {PostStatusApproved},
	PostStatusApproved:  {PostStatusDraft, PostStatusScheduled, PostStatusPublished},
	PostStatusScheduled: {PostStatusApproved, PostStatusPublished},
	PostStatusPublished: {},
}

func (s PostStatus) CanTransitionTo(next PostStatus) bool {
	for _, allowed := range ValidTransitions[s] {
		if allowed == next {
			return true
		}
	}
	return false
}

type PostWorkflow struct {
	Strategy *struct {
		Framework string `json:"framework"`
		Reasoning string `json:"reasoning"`
	} `json:"strategy,omitempty"`
	Clarity *struct {
		Changes string `json:"changes"`
	} `json:"clarity,omitempty"`
	Impact *struct {
		Changes string `json:"changes"`
	} `json:"impact,omitempty"`
}

type Post struct {
	ID            string
	TenantID      string
	Status        PostStatus
	Title         *string
	Content       string
	Hashtags      []string
	MediaType     *string
	Workflow      *PostWorkflow
	MediaPath     *string
	Platforms     []string
	ScheduledDate *string
	ScheduledTime *string
	PublishedAt   *time.Time
	CreatedAt     time.Time
	UpdatedAt     time.Time
}
