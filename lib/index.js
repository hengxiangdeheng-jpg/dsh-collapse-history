/**
 * dsh-collapse-history — host half.
 *
 * This is a pure browser (client) plugin: the server half is intentionally a
 * no-op. All behavior lives in lib/client.js, which the DSH web shell injects
 * when this package is registered as a loader entry that declares
 * `dsh.client` (see package.json).
 */
function apply(_ctx) {}

export { apply };
