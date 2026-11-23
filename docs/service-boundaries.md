# Service boundaries, data ownership and AWS ownership

## Services
| | roadmap-service (S1) | engagement-service (S2) | admin-service (S3) |
|---|---|---|---|
| Owner | Ziad Essameldin Abdelwahed (239680) | Youssef Mohamed Salah (239650) | Joseph Maged Aziz (240028) |
| Port (first replica) | 3001 | 3002 | 3003 |
| Public paths | `/api/features*` (except votes/comments), `/api/categories`, `/api/me/features` | `/api/features/:id/votes`, `/api/features/:id/comments`, `/api/comments/*`, `/api/me/votes`, `/api/engagement/*` | `/api/auth/*`, `/api/admin/*` |
| Functions | 1 submit request · 2 roadmap board with search/filter/sort · 3 edit/delete own request while Under Review · + admin status workflow, canonical resolution | 1 vote / remove vote (one effective vote per canonical request) · 2 comments add/edit/delete · 3 My Votes · + notification worker (Resend), merge-aware counting | 1 duplicate suggestions · 2 merge · 3 undo within 7 days · + register/login, suspend/ban/restore, audit |
| Owns tables | `roadhub-features`, `roadhub-categories` | `roadhub-votes`, `roadhub-comments`, `roadhub-engagement-counts`, `roadhub-engagement-links`, `roadhub-notifications`, `roadhub-processed-messages` | `roadhub-users`, `roadhub-merges`, `roadhub-audit` |
| Reads other data only through | admin internal API (account status) | roadmap internal API (resolve, summaries), admin internal API (status, contacts) | roadmap + engagement internal APIs (merge steps) |

No service reads or writes another service's tables.

## AWS services per student (each must be used by working code)
| Student | AWS services in their own component | How it is used (verifiable) |
|---|---|---|
| Ziad (S1) | **DynamoDB** | features + categories, status index for the board |
| | **EventBridge** | publishes FeatureCreated, FeatureStatusChanged, FeatureMerged/Unmerged on bus `roadhub-events` |
| | **SQS** | consumes `roadhub-roadmap-counts-queue` to keep vote/comment counts for sorting |
| | **CloudWatch Logs** | `/roadhub/roadmap` request + audit logs |
| | **S3** | hosts the frontend (`roadhub-frontend`) |
| Youssef (S2) | **DynamoDB** | votes, comments, counts, links, notifications, processed messages |
| | **SQS + DLQ** | `roadhub-notify-queue` consumed by the notification worker; `roadhub-notify-dlq` after 3 failures |
| | **SNS** | publishes to `roadhub-ops-alerts` when a notification job fails permanently |
| | **EventBridge** | publishes VoteAdded/VoteRemoved/CommentAdded/EngagementCountsChanged; owns the notify rule |
| | **Secrets Manager** | reads `roadhub/resend` |
| Joseph (S3) | **DynamoDB** | users, merges, audit |
| | **Secrets Manager** | holds the JWT private key (only admin may read it) and the internal service key |
| | **EventBridge** | publishes UserSuspended/UserBanned/UserRestored, MergeCompleted/MergeUndone |
| | **SNS** | admin service subscribes to `roadhub-ops-alerts` (alerts shown on the admin dashboard); CloudWatch alarm → SNS |
| | **CloudWatch Logs** | `/roadhub/admin` incl. failed-login metric filter and alarm |
| Shared | IAM | one role + least-privilege policy per service |
| Shared (recorded) | ELB, ECS, Application Auto Scaling | SIMULATED: recorded in Floci, gateway does the real routing |
