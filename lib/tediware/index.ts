/**
 * The one module that talks to Tediware. The sync and scripts call it;
 * nothing else issues fetches against Tediware URLs. Keep the surface small
 * and plain: no retry frameworks, no queues.
 *
 * Everything here reads. The app never sends, resends or changes anything
 * in Tediware, so a read-only API key is all it needs.
 */
export {
  describeConfig,
  getApiConfig,
  isApiConfigured,
  syncDays,
  syncIntervalSeconds,
  type ApiConfig,
} from "./env"
export { errorMessageFromBody, TediwareError } from "./client"
export {
  FEED_PAGE_SIZE,
  listFeedEntries,
  transactionSetOf,
  usageIndicatorOf,
  type FeedEntry,
  type FeedPage,
  type ResultArtifact,
} from "./feed"
export {
  candidateArtifacts,
  fetchArtifactText,
  fetchX12Document,
  isX12Shaped,
} from "./artifacts"
