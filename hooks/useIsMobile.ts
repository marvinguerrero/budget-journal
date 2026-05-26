'use client'

import { useState, useEffect } from 'react'

/** Returns true when the viewport is narrower than 640px (sm breakpoint).
 *  Starts as false (server-safe) and corrects after first paint. */
export function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const check = () => {
      const hasTouch = navigator.maxTouchPoints > 0
      const isSmallScreen = window.matchMedia('(max-width: 767px)').matches
      setIsMobile(hasTouch && isSmallScreen)
    }
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  return isMobile
}
