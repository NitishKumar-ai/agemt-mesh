package com.netflix.conductor.core;

/** Store the authentication context, app or username or both */
public class WorkflowContext {

    public static final ThreadLocal<WorkflowContext> THREAD_LOCAL =
            InheritableThreadLocal.withInitial(() -> new WorkflowContext("", ""));

    private final String clientApp;

    private final String userName;

    public WorkflowContext(String clientApp) {
        this.clientApp = clientApp;
        this.userName = null;
    }

    public WorkflowContext(String clientApp, String userName) {
        this.clientApp = clientApp;
        this.userName = userName;
    }

    public static WorkflowContext get() {
        return THREAD_LOCAL.get();
    }

    public static void set(WorkflowContext ctx) {
        THREAD_LOCAL.set(ctx);
    }

    public static void unset() {
        THREAD_LOCAL.remove();
    }

    /**
     * @return the clientApp
     */
    public String getClientApp() {
        return clientApp;
    }

    /**
     * @return the username
     */
    public String getUserName() {
        return userName;
    }
}
