import { lazy, Suspense, type ReactElement } from 'react'
import type { CesiumGlobeProps } from './CesiumGlobe'

const CesiumGlobeLazy = lazy(() => import('./CesiumGlobe'))

const LazyCesiumGlobe = (props: CesiumGlobeProps): ReactElement => (
  <Suspense fallback={null}>
    <CesiumGlobeLazy {...props} />
  </Suspense>
)

export default LazyCesiumGlobe
