export const releaseVersion =
  process.env?.VITE_AGENTMESH_UI_VERSION == null
    ? "latest"
    : process.env.VITE_AGENTMESH_UI_VERSION;
