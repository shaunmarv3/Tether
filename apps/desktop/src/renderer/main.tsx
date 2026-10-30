import { createRoot } from 'react-dom/client'
import { App } from './App'
import { AppWindow } from './AppWindow'
import { Preview, type PreviewKind } from './Preview'
import './theme.css'

// App windows load the same page with ?app=<package>&name=<name>&shape=<shape>; previews with ?preview=<file>&kind=….
const q = new URLSearchParams(location.search)
const pkg = q.get('app')
const preview = q.get('preview')
if (pkg) document.title = q.get('name') ?? pkg
if (preview) document.title = preview

createRoot(document.getElementById('root')!).render(
  preview ? <Preview name={preview} kind={q.get('kind') as PreviewKind} pos={q.get('pos') ?? ''} />
    : pkg ? <AppWindow pkg={pkg} name={q.get('name') ?? pkg} free={q.get('shape') === 'free'} /> : <App />,
)
