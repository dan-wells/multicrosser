// Random id generator that prefers crypto.randomUUID when available, falling
// back to a timestamp + Math.random string. The fallback exists for non-secure
// contexts (e.g. a phone hitting the desktop's LAN IP over plain HTTP), where
// crypto.randomUUID is undefined.
const generateId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
};

export default generateId;
