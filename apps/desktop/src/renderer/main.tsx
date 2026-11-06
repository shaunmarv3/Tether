import { createRoot } from 'react-dom/client'
import { App } from './App'
import { AppWindow } from './AppWindow'
import { Preview, type PreviewKind } from './Preview'
import './theme.css'
import './ui.css'
import './shell.css'

// App windows load the same page with ?app=<package>&name=<name>&shape=<shape>; the pop-out phone with ?phone=1&name=…;
// previews with ?preview=<file>&kind=….
const q = new URLSearchParams(location.search)
const pkg = q.get('app')
const phone = q.get('phone') === '1'
const preview = q.get('preview')
if (pkg || phone) document.title = q.get('name') ?? pkg ?? 'Phone'
if (preview) document.title = preview

createRoot(document.getElementById('root')!).render(
  preview ? <Preview name={preview} kind={q.get('kind') as PreviewKind} pos={q.get('pos') ?? ''} />
    : pkg ? <AppWindow view={`app:${pkg}`} name={q.get('name') ?? pkg} free={q.get('shape') === 'free'} />
    : phone ? <AppWindow view="mirror" name={q.get('name') ?? 'Phone'} free={false} /> : <App />,
)
