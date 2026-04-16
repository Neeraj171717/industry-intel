import { redirect } from 'next/navigation'

export default function RootPage() {
  // Redirect root to feed. Anonymous users can browse freely.
  // Middleware handles authenticated role routing (editors → /editor/inbox, etc.)
  redirect('/feed')
}
