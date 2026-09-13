export const API = '/api'

function getToken() {
  return localStorage.getItem('sever_token')
}

// Встроенные медиа-элементы (<audio>/<video>/poster) не умеют слать заголовок
// Authorization, поэтому для приватных файлов добавляем токен в query (?token=).
// Открытые файлы (картинки, аватары) отдаются и без токена — им он не нужен.
export function mediaUrl(url) {
  if (!url || !String(url).startsWith('/uploads/')) return url
  const token = getToken()
  if (!token) return url
  const sep = String(url).includes('?') ? '&' : '?'
  return `${url}${sep}token=${encodeURIComponent(token)}`
}

export async function api(path, { method = 'GET', body, formData } = {}) {
  const headers = {}
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`
  if (body && !formData) headers['Content-Type'] = 'application/json'

  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: formData ? formData : body ? JSON.stringify(body) : undefined
  })

  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const e = new Error(data.error || 'Что-то пошло не так')
    e.code = data.code || null
    e.status = res.status
    throw e
  }
  return data
}

export const authApi = {
  register: (payload) => api('/auth/register', { method: 'POST', body: payload }),
  login: (payload) => api('/auth/login', { method: 'POST', body: payload }),
  verifyTwoFactor: (loginToken, code) => api('/auth/verify-2fa', { method: 'POST', body: { loginToken, code } }),
  me: () => api('/auth/me'),
  twoFactorStatus: () => api('/auth/2fa/status'),
  twoFactorSetup: (password) => api('/auth/2fa/setup', { method: 'POST', body: { password } }),
  twoFactorEnable: (password, code) => api('/auth/2fa/enable', { method: 'POST', body: { password, code } }),
  twoFactorDisable: (password, code) => api('/auth/2fa/disable', { method: 'POST', body: { password, code } }),
  logoutAll: () => api('/auth/logout-all', { method: 'POST' }),
  sessions: () => api('/auth/sessions'),
  revokeSession: (id) => api(`/auth/sessions/${id}`, { method: 'DELETE' }),
  securityLog: () => api('/auth/security-log')
}

export const usersApi = {
  get: (username) => api(`/users/${username}`),
  search: (q) => api(`/users?q=${encodeURIComponent(q)}`),
  update: (payload) => api('/users/me', { method: 'PUT', body: payload }),
  uploadAvatar: (formData) => api('/users/me/avatar', { method: 'POST', formData }),
  uploadCover: (formData) => api('/users/me/cover', { method: 'POST', formData }),
  changePassword: (payload) => api('/users/me/password', { method: 'POST', body: payload }),
  setNsfw: (showNsfw, password) => api('/users/me/nsfw', { method: 'POST', body: { showNsfw, password } }),
  followers: (username) => api(`/users/${username}/followers`),
  following: (username) => api(`/users/${username}/following`),
  follow: (id) => api(`/users/${id}/follow`, { method: 'POST' }),
  unfollow: (id) => api(`/users/${id}/follow`, { method: 'DELETE' }),
  posts: (username, page) => api(`/users/${username}/posts?page=${page || 1}`),
  avatar: (username) => api(`/users/${username}/avatar`),
  avatarComment: (username, body) => api(`/users/${username}/avatar/comments`, { method: 'POST', body: { body } })
}

export const friendsApi = {
  list: () => api('/friends'),
  userFriends: (username) => api(`/friends/${username}`),
  requests: () => api('/friends/requests'),
  send: (userId) => api(`/friends/${userId}/request`, { method: 'POST' }),
  cancel: (userId) => api(`/friends/${userId}/request`, { method: 'DELETE' }),
  respond: (userId, approve) => api(`/friends/${userId}/respond`, { method: 'POST', body: { approve } }),
  remove: (userId) => api(`/friends/${userId}`, { method: 'DELETE' })
}

export const groupsApi = {
  list: (q) => api(`/groups${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  get: (id) => api(`/groups/${id}`),
  create: (payload) => api('/groups', { method: 'POST', body: payload }),
  update: (id, payload) => api(`/groups/${id}`, { method: 'PUT', body: payload }),
  uploadAvatar: (id, formData) => api(`/groups/${id}/avatar`, { method: 'POST', formData }),
  uploadCover: (id, formData) => api(`/groups/${id}/cover`, { method: 'POST', formData }),
  join: (id, token) => api(`/groups/${id}/join`, { method: 'POST', body: { token } }),
  leave: (id) => api(`/groups/${id}/join`, { method: 'DELETE' }),
  invite: (id, username) => api(`/groups/${id}/invite`, { method: 'POST', body: { username } }),
  acceptInvite: (id) => api(`/groups/${id}/invites/accept`, { method: 'POST' }),
  declineInvite: (id) => api(`/groups/${id}/invites/decline`, { method: 'POST' }),
  regenerateLink: (id) => api(`/groups/${id}/invite-link`, { method: 'POST' }),
  kick: (id, userId) => api(`/groups/${id}/members/${userId}/kick`, { method: 'POST' }),
  setRole: (id, userId, admin) => api(`/groups/${id}/members/${userId}/role`, { method: 'POST', body: { admin } }),
  remove: (id) => api(`/groups/${id}`, { method: 'DELETE' }),
  messages: (id, { before, limit } = {}) => api(`/groups/${id}/messages?limit=${limit || 100}${before ? `&before=${before}` : ''}`),
  sendMessage: (id, body) => api(`/groups/${id}/messages`, { method: 'POST', body: { body } }),
  sendMessageWithAttachments: (id, body, attachmentMeta) => api(`/groups/${id}/messages`, { method: 'POST', body: { body, attachmentMeta: JSON.stringify(attachmentMeta) } })
}

export const reportsApi = {
  create: (payload) => api('/reports', { method: 'POST', body: payload })
}

export const postsApi = {
  feed: (kind, page) => api(`/posts?feed=${kind || 'home'}&page=${page || 1}`),
  trending: () => api('/posts?feed=trending'),
  get: (id) => api(`/posts/${id}`),
  view: (id) => api(`/posts/${id}/view`, { method: 'POST' }),
  views: (ids) => api('/posts/views', { method: 'POST', body: { ids } }),
  create: (formData) => api('/posts', { method: 'POST', formData }),
  del: (id) => api(`/posts/${id}`, { method: 'DELETE' }),
  edit: (id, body) => api(`/posts/${id}`, { method: 'PUT', body: { body } }),
  pin: (id, until) => api(`/posts/${id}/pin`, { method: 'PUT', body: { until } }),
  likes: (id) => api(`/posts/${id}/likes`),
  react: (id, type) => api(`/posts/${id}/reaction`, { method: 'PUT', body: { type } }),
  comment: (id, body, parentId) => api(`/posts/${id}/comments`, { method: 'POST', body: { body, parentId: parentId || null } }),
  pollVote: (id, option) => api(`/posts/${id}/poll`, { method: 'POST', body: { option } }),
  repost: (id) => {
    const fd = new FormData()
    fd.append('repostOfId', id)
    return api('/posts', { method: 'POST', formData: fd })
  },
  forward: (messageId, body) => api('/posts/forward', { method: 'POST', body: { messageId, body } })
}

export const communitiesApi = {
  list: (q) => api(`/communities${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  get: (id) => api(`/communities/${id}`),
  create: (payload) => api('/communities', { method: 'POST', body: payload }),
  update: (id, payload) => api(`/communities/${id}`, { method: 'PUT', body: payload }),
  uploadAvatar: (id, formData) => api(`/communities/${id}/avatar`, { method: 'POST', formData }),
  uploadCover: (id, formData) => api(`/communities/${id}/cover`, { method: 'POST', formData }),
  join: (id) => api(`/communities/${id}/join`, { method: 'POST' }),
  leave: (id) => api(`/communities/${id}/join`, { method: 'DELETE' }),
  joinRequests: (id) => api(`/communities/${id}/join-requests`),
  respondJoinRequest: (id, userId, approve) => api(`/communities/${id}/join-requests/${userId}/respond`, { method: 'POST', body: { approve } }),
  members: (id, limit, offset) => api(`/communities/${id}/members${limit ? `?limit=${limit}&offset=${offset || 0}` : ''}`),
  setMemberRole: (id, userId, admin) => api(`/communities/${id}/members/${userId}/role`, { method: 'PUT', body: { admin } }),
  kickMember: (id, userId) => api(`/communities/${id}/members/${userId}`, { method: 'DELETE' }),
  deleteCommunityPost: (id, postId) => api(`/communities/${id}/posts/${postId}`, { method: 'DELETE' }),
  pinCommunityPost: (id, postId, until) => api(`/communities/${id}/posts/${postId}/pin`, { method: 'PUT', body: { until } }),
  posts: (id) => api(`/communities/${id}/posts`),
  createCommunityPost: (id, body) => api(`/communities/${id}/posts`, { method: 'POST', body: { body } })
}

export const messagesApi = {
  conversations: () => api('/messages/conversations'),
  messages: (id) => api(`/messages/conversations/${id}/messages`),
  send: (id, body) => api(`/messages/conversations/${id}/messages`, { method: 'POST', body: { body } }),
  sendAttached: (id, formData) => api(`/messages/conversations/${id}/messages`, { method: 'POST', formData }),
  open: (userId) => api('/messages/conversations', { method: 'POST', body: { userId } }),
  requests: () => api('/messages/requests'),
  sendRequest: (userId) => api('/messages/requests', { method: 'POST', body: { userId } }),
  respondRequest: (fromUserId, approve) => api(`/messages/requests/${fromUserId}/respond`, { method: 'POST', body: { approve } }),
  unread: () => api('/messages/unread'),
  edit: (convId, messageId, body) => api(`/messages/conversations/${convId}/messages/${messageId}`, { method: 'PUT', body: { body } }),
  delMessage: (convId, messageId) => api(`/messages/conversations/${convId}/messages/${messageId}`, { method: 'DELETE' }),
  delConversation: (id) => api(`/messages/conversations/${id}`, { method: 'DELETE' }),
  pollVote: (messageId, option) => api('/messages/poll', { method: 'POST', body: { messageId, option } }),
  forward: (convId, messageId) => api(`/messages/conversations/${convId}/messages/${messageId}/forward`, { method: 'POST' }),
  unmuteUser: (userId) => api(`/messages/unmute/${userId}`, { method: 'POST' }),
  userMute: (userId) => api(`/messages/mute/${userId}`)
}

export const configApi = {
  get: () => api('/config')
}

export const aboutApi = {
  get: () => api('/about')
}

export const libraryApi = {
  albums: () => api('/library/albums'),
  album: (id) => api(`/library/albums/${id}`),
  createAlbum: (title, files) => {
    const fd = new FormData()
    fd.append('title', title)
    files.forEach(f => fd.append('file', f))
    return api('/library/albums', { method: 'POST', formData: fd })
  },
  addPhotos: (id, files) => {
    const fd = new FormData()
    files.forEach(f => fd.append('file', f))
    return api(`/library/albums/${id}/photos`, { method: 'POST', formData: fd })
  },
  deleteAlbum: (id) => api(`/library/albums/${id}`, { method: 'DELETE' }),
  renameAlbum: (id, title) => api(`/library/albums/${id}`, { method: 'PUT', body: { title } }),
  deletePhoto: (albumId, photoId) => api(`/library/albums/${albumId}/photos/${photoId}`, { method: 'DELETE' }),
  videos: () => api('/library/videos'),
  uploadVideo: (title, file, { description = '', preview = null, playlistId = null } = {}) => {
    const fd = new FormData()
    fd.append('title', title)
    if (description) fd.append('description', description)
    if (preview) fd.append('preview', preview)
    if (playlistId) fd.append('playlistId', playlistId)
    if (file) fd.append('file', file)
    return api('/library/videos', { method: 'POST', formData: fd })
  },
  updateVideo: (id, payload) => api(`/library/videos/${id}`, { method: 'PUT', body: payload }),
  changeVideoPreview: (id, formData) => api(`/library/videos/${id}/preview`, { method: 'POST', formData }),
  hideVideo: (id) => api(`/library/videos/${id}/hide`, { method: 'POST' }),
  bookmarkedVideos: () => api('/library/videos/bookmarks'),
  playlists: () => api('/library/videos/playlists'),
  playlistsOfVideo: (id) => api(`/library/videos/${id}/playlists`),
  createPlaylist: (title) => api('/library/videos/playlists', { method: 'POST', body: { title } }),
  renamePlaylist: (id, title) => api(`/library/videos/playlists/${id}`, { method: 'PUT', body: { title } }),
  deletePlaylist: (id) => api(`/library/videos/playlists/${id}`, { method: 'DELETE' }),
  playlist: (id) => api(`/library/videos/playlists/${id}`),
  setVideoPlaylist: (videoId, playlistId, on) => api(`/library/videos/${videoId}/playlist`, { method: 'POST', body: { playlistId, on } }),
  likeVideo: (id) => api(`/library/videos/${id}/like`, { method: 'POST' }),
  viewVideo: (id) => api(`/library/videos/${id}/view`, { method: 'POST' }),
  deleteVideo: (id) => api(`/library/videos/${id}`, { method: 'DELETE' }),
  feed: (sort, q) => api(`/library/feed?sort=${sort || 'date'}${q ? `&q=${encodeURIComponent(q)}` : ''}`),
  video: (id) => api(`/library/videos/${id}`),
  addVideoToPlaylist: (videoId, playlistId, on) => api(`/library/videos/${videoId}/playlist`, { method: 'POST', body: { playlistId, on } }),
  commentVideo: (id, body, parentId) => api(`/library/videos/${id}/comments`, { method: 'POST', body: { body, parentId: parentId || null } }),
  photo: (photoId) => api(`/library/photos/${photoId}`),
  likePhoto: (photoId) => api(`/library/photos/${photoId}/like`, { method: 'POST' }),
  commentPhoto: (photoId, body, parentId) => api(`/library/photos/${photoId}/comments`, { method: 'POST', body: { body, parentId: parentId || null } }),
  audios: () => api('/library/audios'),
  uploadAudio: (title, artist, file, cover = null) => {
    const fd = new FormData()
    fd.append('title', title)
    if (artist) fd.append('artist', artist)
    fd.append('file', file)
    if (cover) fd.append('cover', cover)
    return api('/library/audios', { method: 'POST', formData: fd })
  },
  deleteAudio: (id) => api(`/library/audios/${id}`, { method: 'DELETE' }),
  notes: () => api('/library/notes'),
  createNote: (text) => api('/library/notes', { method: 'POST', body: { text } }),
  updateNote: (id, text) => api(`/library/notes/${id}`, { method: 'PUT', body: { text } }),
  deleteNote: (id) => api(`/library/notes/${id}`, { method: 'DELETE' })
}

export const adminApi = {
  settings: () => api('/admin/settings'),
  updateSettings: (payload) => api('/admin/settings', { method: 'PUT', body: payload }),
  stats: () => api('/admin/stats'),
  comments: () => api('/admin/comments'),
  deleteComment: (id) => api(`/admin/comments/${id}`, { method: 'DELETE' }),
  posts: () => api('/admin/posts'),
  deletePost: (id) => postsApi.del(id),
  communities: () => api('/admin/communities'),
  deleteCommunity: (id) => api(`/admin/communities/${id}`, { method: 'DELETE' }),
  users: () => api('/admin/users'),
  mutes: () => api('/admin/mutes'),
  toggleTester: (id, isTester) => api(`/admin/users/${id}/tester`, { method: 'PUT', body: { isTester } }),
  toggleVerified: (id, verified) => api(`/admin/users/${id}/verified`, { method: 'PUT', body: { verified } }),
  toggleModerator: (id, isModerator) => api(`/admin/users/${id}/moderator`, { method: 'PUT', body: { isModerator } }),
  toggleForeignAgent: (id, isForeignAgent) => api(`/admin/users/${id}/foreign-agent`, { method: 'PUT', body: { isForeignAgent } }),
  memorialize: (id, memorialized) => api(`/admin/users/${id}/memorialize`, { method: 'PUT', body: { memorialized } }),
  block: (id, duration, reason) => api(`/admin/users/${id}/block`, { method: 'PUT', body: { duration, reason } }),
  unblock: (id) => api(`/admin/users/${id}/block`, { method: 'DELETE' }),
  muteContent: (id, type, duration) => api(`/admin/users/${id}/mute/${type}`, { method: 'PUT', body: { duration } }),
  unmuteContent: (id, type) => api(`/admin/users/${id}/mute/${type}`, { method: 'DELETE' }),
  unmute: (id) => api(`/admin/users/${id}/mute`, { method: 'DELETE' }),
  videos: () => api('/admin/videos'),
  reports: (status) => api(`/admin/reports?status=${status || 'all'}`),
  respondReport: (id, payload) => api(`/admin/reports/${id}`, { method: 'PUT', body: payload }),
  deleteReport: (id) => api(`/admin/reports/${id}`, { method: 'DELETE' }),
  blockedIps: () => api('/admin/blocked-ips'),
  addBlockedIp: (payload) => api('/admin/blocked-ips', { method: 'POST', body: payload }),
  removeBlockedIp: (ip) => api(`/admin/blocked-ips/${encodeURIComponent(ip)}`, { method: 'DELETE' })
}

export const eventsApi = {
  list: () => api('/events'),
  unread: () => api('/events/unread'),
  markAllRead: () => api('/events/read', { method: 'POST' }),
  markRead: (id) => api(`/events/${id}/read`, { method: 'POST' }),
  del: (id) => api(`/events/${id}`, { method: 'DELETE' })
}

export const bookmarksApi = {
  toggle: (type, id, on) => api(`/bookmarks/${type}/${id}`, { method: 'PUT', body: { on } }),
  posts: () => api('/bookmarks/posts')
}