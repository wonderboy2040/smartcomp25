'use client'

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react'

type Theme = 'light' | 'dark'
type ResolvedTheme = 'light' | 'dark'

interface ThemeContextType {
  theme: Theme
  resolvedTheme: ResolvedTheme
  toggleTheme: () => void
  setTheme: (t: Theme) => void
}

const STORAGE_KEY = 'smartcomp-theme'

const ThemeContext = createContext<ThemeContextType>({
  theme: 'dark',
  resolvedTheme: 'dark',
  toggleTheme: () => {},
  setTheme: () => {},
})

function getInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'dark'
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'light' || stored === 'dark') return stored
  } catch {}
  return 'dark'
}

function applyTheme(nextTheme: Theme) {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  const isDark = nextTheme === 'dark'

  root.classList.toggle('dark', isDark)
  root.style.colorScheme = isDark ? 'dark' : 'light'

  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) {
    meta.setAttribute('content', isDark ? '#020617' : '#f8fafc')
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeState, setThemeState] = useState<Theme>('dark')

  useEffect(() => {
    const initialTheme = getInitialTheme()
    setThemeState(initialTheme)
    applyTheme(initialTheme)
  }, [])

  const setTheme = useCallback((nextTheme: Theme) => {
    setThemeState(nextTheme)
    applyTheme(nextTheme)
    try {
      localStorage.setItem(STORAGE_KEY, nextTheme)
    } catch {}
  }, [])

  const toggleTheme = useCallback(() => {
    setThemeState((currentTheme) => {
      const nextTheme: Theme = currentTheme === 'dark' ? 'light' : 'dark'
      applyTheme(nextTheme)
      try {
        localStorage.setItem(STORAGE_KEY, nextTheme)
      } catch {}
      return nextTheme
    })
  }, [])

  return (
    <ThemeContext.Provider value={{ theme: themeState, resolvedTheme: themeState, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}
