import { createContext, useContext, useState } from 'react'

const PlayerContext = createContext(null)

// Мини-плеер: аудио и видео продолжают играть при переходах по сайту.
// track = { type: 'audio'|'video', url, title, cover?, poster?, startTime? }
export function PlayerProvider({ children }) {
  const [track, setTrack] = useState(null)
  const play = (t) => setTrack({ ...t })
  const stop = () => setTrack(null)
  return (
    <PlayerContext.Provider value={{ track, play, stop }}>
      {children}
    </PlayerContext.Provider>
  )
}

export function usePlayer() {
  return useContext(PlayerContext)
}
