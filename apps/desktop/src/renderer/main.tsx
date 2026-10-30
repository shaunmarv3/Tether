import { createRoot } from 'react-dom/client'
import { App } from './App'
import { AppWindow } from './AppWindow'
import './theme.css'

// App windows load the same page with ?app=<package>&name=<name>&shape=<shape>.
const q = new URLSearchParams(location.search)
const pkg = q.get('app')
if (pkg) document.title = q.get('name') ?? pkg

createRoot(document.getElementById('root')!).render(
  pkg ? <AppWindow pkg={pkg} name={q.get('name') ?? pkg} free={q.get('shape') === 'free'} /> : <App />,
)
