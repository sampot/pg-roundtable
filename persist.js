const KEY = "progress";

export async function loadProgress() {
  await window.PG.ready;
  try {
    const raw = await PG.kv.get(KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export async function saveProgress(data) {
  await window.PG.ready;
  try {
    await PG.kv.put(KEY, JSON.stringify(data));
  } catch (e) {
    throw e;
  }
  return data;
}
