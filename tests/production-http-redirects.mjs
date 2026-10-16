// Reject redirects before contacting an unexpected origin. No credentials required.
export async function fetchSameOrigin(url, init = {}, fetcher = fetch) {
  const initial = new URL(url);
  let current = initial;
  for (let redirects = 0; redirects <= 5; redirects++) {
    const response = await fetcher(current, { ...init, redirect: "manual" });
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    const location = response.headers.get("location");
    if (!location) throw new Error("redirect without Location header");
    const target = new URL(location, current);
    if (target.origin !== initial.origin) {
      throw new Error(`unexpected redirect origin: ${target.origin}`);
    }
    if (redirects === 5) throw new Error("too many same-origin redirects");
    current = target;
  }
  throw new Error("too many redirects");
}
