import { useTheme } from '../context/ThemeContext'

// Returns the correct Carto tile URL for the current theme
export function useMapTile() {
  const { isDark } = useTheme()
  return isDark
    ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
    : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
}
