const EVENT_TYPE_SLUG_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;
const DEFAULT_EVENT_TYPE_SLUG = "test-SCI";

export const resolveCalnodeEventTypeSlug = (
  runtimeEnv: Record<string, string | undefined>,
  requestedSlug: string | null | undefined,
) => {
  const slug = requestedSlug?.trim();

  if (slug) {
    return EVENT_TYPE_SLUG_PATTERN.test(slug) ? slug : null;
  }

  return runtimeEnv.CALNODE_EVENT_TYPE_SLUG?.trim() || DEFAULT_EVENT_TYPE_SLUG;
};
