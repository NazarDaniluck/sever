const connections = new Map()

export function markOnline(id) {
  connections.set(id, (connections.get(id) || 0) + 1)
}

export function markOffline(id) {
  const n = (connections.get(id) || 1) - 1
  if (n <= 0) connections.delete(id)
  else connections.set(id, n)
}

export function isOnline(id) {
  return connections.has(id)
}
