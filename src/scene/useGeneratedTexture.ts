import { useEffect, useMemo } from 'react'
import { useThree } from '@react-three/fiber'
import type { CanvasTexture } from 'three'

/**
 * Builds a canvas texture once, stamps the renderer's max anisotropy on it, and
 * disposes it on unmount. `factory` must be stable for the life of the component
 * (module-level function or a `useCallback`), which every caller here satisfies.
 */
export function useGeneratedTexture(factory: () => CanvasTexture, aniso = true): CanvasTexture {
  const maxAniso = useThree((s) => s.gl.capabilities.getMaxAnisotropy())

  const texture = useMemo(() => {
    const tex = factory()
    if (aniso) tex.anisotropy = Math.min(8, maxAniso)
    return tex
    // eslint-disable-next-line react-hooks/exhaustive-deps -- factory is module-level
  }, [factory, aniso, maxAniso])

  useEffect(() => () => texture.dispose(), [texture])

  return texture
}
