import Docker from "dockerode";

/** Default local socket (dockerode's own default) — the box already runs Docker for
 * other purposes, no override needed for this deployment. */
export const docker = new Docker();
