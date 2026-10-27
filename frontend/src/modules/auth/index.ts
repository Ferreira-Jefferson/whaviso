import { lazy } from 'react'

export const LoginPage = lazy(() => import('./pages/Login'))
export const OnboardingPage = lazy(() => import('./pages/Onboarding'))
export { GoogleLoginButton } from './components/GoogleLoginButton'
