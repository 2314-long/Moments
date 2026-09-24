import React from 'react'
import ReactDOM from 'react-dom/client'
import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom'
import './index.css'
import { HomePage } from './pages/HomePage'
import { CreateAlbumPage } from './pages/CreateAlbumPage'
import { EditorPage } from './pages/EditorPage'
import { PreviewPage } from './pages/PreviewPage'
import { PhotoLibraryPage } from './pages/PhotoLibraryPage'
import { SharePage } from './pages/SharePage'
import { NotFoundPage } from './pages/NotFoundPage'
import { LibraryBootstrap } from './components/LibraryBootstrap'

const router = createBrowserRouter([
  { path: '/', element: <HomePage /> },
  { path: '/create', element: <CreateAlbumPage /> },
  { path: '/photos', element: <PhotoLibraryPage /> },
  { path: '/album/:albumId/edit', element: <EditorPage /> },
  { path: '/album/:albumId/read', element: <PreviewPage /> },
  { path: '/album/:albumId/read/:pageIndex', element: <PreviewPage /> },
  { path: '/share/:slug', element: <SharePage /> },
  { path: '/404', element: <NotFoundPage /> },
  { path: '*', element: <Navigate to="/404" replace /> },
])

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <LibraryBootstrap>
      <RouterProvider router={router} />
    </LibraryBootstrap>
  </React.StrictMode>,
)
