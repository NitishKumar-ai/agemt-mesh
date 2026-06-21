import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { LandingPage } from './pages/LandingPage';
import { ConductorLayout } from './conductor/ConductorLayout';
import { WorkflowDefs } from './pages/conductor/WorkflowDefs';
import { WorkflowDefDetail } from './pages/conductor/WorkflowDefDetail';
import { TaskDefs } from './pages/conductor/TaskDefs';
import { TaskDefDetail } from './pages/conductor/TaskDefDetail';
import { Executions } from './pages/conductor/Executions';
import { ExecutionDetail } from './pages/conductor/ExecutionDetail';
import { EventHandlers, EventHandlerDetail } from './pages/conductor/EventHandlers';
import { Schedulers, SchedulerDetail } from './pages/conductor/Schedulers';
import { TaskQueue } from './pages/conductor/TaskQueue';
import { EventQueues } from './pages/conductor/EventQueues';
import './styles/app.css';
import './styles/codex.css';
import './styles/production-ui.css';
import './styles/landing.css';
// Applies persisted theme/motion preferences before first paint.
import './lib/preferences';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      retry: 1,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          {/* New orchestration pages under Conductor layout */}
          <Route path="/workflows" element={<ConductorLayout />}>
            <Route index element={<WorkflowDefs />} />
            <Route path="definitions" element={<WorkflowDefs />} />
            <Route path="definitions/:name/*" element={<WorkflowDefDetail />} />
            <Route path="executions" element={<Executions />} />
            <Route path="executions/:id" element={<ExecutionDetail />} />
          </Route>

          <Route path="/tasks" element={<ConductorLayout />}>
            <Route index element={<TaskDefs />} />
            <Route path="definitions" element={<TaskDefs />} />
            <Route path="definitions/:name" element={<TaskDefDetail />} />
            <Route path="queue" element={<TaskQueue />} />
          </Route>

          <Route path="/events" element={<ConductorLayout />}>
            <Route index element={<EventHandlers />} />
            <Route path="handlers" element={<EventHandlers />} />
            <Route path="handlers/:name" element={<EventHandlerDetail />} />
            <Route path="queues" element={<EventQueues />} />
          </Route>

          <Route path="/schedulers" element={<ConductorLayout />}>
            <Route index element={<Schedulers />} />
            <Route path=":name" element={<SchedulerDetail />} />
          </Route>

          <Route path="/*" element={<App />} />
        </Routes>
      </QueryClientProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
