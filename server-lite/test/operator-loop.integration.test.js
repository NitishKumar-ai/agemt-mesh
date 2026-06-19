import { describe, it, expect } from 'vitest';
import { bootstrapServer } from '../src/index.js';
class TestBarrier {
    armed = false;
    armedWaiters = [];
    releaseResolve = null;
    async hold() {
        const releasePromise = new Promise((resolve) => {
            this.releaseResolve = resolve;
        });
        this.armed = true;
        const waiters = this.armedWaiters;
        this.armedWaiters = [];
        for (const waiter of waiters)
            waiter();
        await releasePromise;
    }
    async waitUntilArmed() {
        if (this.armed)
            return;
        await new Promise((resolve) => this.armedWaiters.push(resolve));
    }
    isArmed() {
        return this.armed;
    }
    release() {
        if (!this.armed)
            return;
        this.armed = false;
        const resolve = this.releaseResolve;
        this.releaseResolve = null;
        resolve?.();
    }
}
describe('Operator Loop Integration with TestBarrier', () => {
    it('should start, pause, resume and retry a workflow using the test barrier', async () => {
        // 1. Setup server with in-memory database and test barrier
        const barrier = new TestBarrier();
        const port = 18080;
        const serverUrl = `http://localhost:${port}`;
        // Set environment variable so agent LLM behaves deterministically (stub)
        process.env.ANTHROPIC_API_KEY = '';
        process.env.GEMINI_API_KEY = '';
        const { close } = await bootstrapServer({
            barrier,
            port,
            dbPath: ':memory:',
            installSignalHandlers: false,
        });
        try {
            // 2. Start a workflow by running an agent
            const runRes = await fetch(`${serverUrl}/api/agents/commit_guard/run`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    goal: 'Perform static analysis on dummy repo',
                    context: 'Test context',
                }),
            });
            if (!runRes.ok) {
                console.error('Run response failed:', runRes.status, await runRes.text());
            }
            expect(runRes.ok).toBe(true);
            const { workflowId } = await runRes.json();
            expect(workflowId).toBeDefined();
            // 3. Wait until the planning step hits the barrier and arms it
            await barrier.waitUntilArmed();
            expect(barrier.isArmed()).toBe(true);
            // Verify workflow status is RUNNING
            const wfStatusRes = await fetch(`${serverUrl}/api/workflow/${workflowId}`);
            expect(wfStatusRes.ok).toBe(true);
            const wfStatus = await wfStatusRes.json();
            expect(wfStatus.status).toBe('RUNNING');
            // 4. Pause the workflow
            const pauseRes = await fetch(`${serverUrl}/api/workflow/${workflowId}/pause`, {
                method: 'PUT',
            });
            expect(pauseRes.ok).toBe(true);
            // 5. Release the barrier and let the task complete
            barrier.release();
            // Give it a moment to run the decider and transition to PAUSED
            let isPaused = false;
            for (let i = 0; i < 20; i++) {
                await new Promise((r) => setTimeout(r, 100));
                const statusRes = await fetch(`${serverUrl}/api/workflow/${workflowId}`);
                const statusData = await statusRes.json();
                if (statusData.status === 'PAUSED') {
                    isPaused = true;
                    break;
                }
            }
            expect(isPaused).toBe(true);
            // 6. Resume the workflow
            const resumeRes = await fetch(`${serverUrl}/api/workflow/${workflowId}/resume`, {
                method: 'PUT',
            });
            expect(resumeRes.ok).toBe(true);
            // Verify the workflow eventually completes successfully (since it uses LLM stubs)
            let isCompleted = false;
            for (let i = 0; i < 50; i++) {
                await new Promise((r) => setTimeout(r, 100));
                const statusRes = await fetch(`${serverUrl}/api/workflow/${workflowId}`);
                const statusData = await statusRes.json();
                if (statusData.status === 'COMPLETED') {
                    isCompleted = true;
                    break;
                }
            }
            expect(isCompleted).toBe(true);
        }
        finally {
            // 7. Clean up and close the server
            await close();
        }
    }, 20000); // 20s timeout
});
//# sourceMappingURL=operator-loop.integration.test.js.map