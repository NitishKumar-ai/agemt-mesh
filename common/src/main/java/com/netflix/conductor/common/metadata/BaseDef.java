package com.netflix.conductor.common.metadata;

import java.util.Collections;
import java.util.EnumMap;
import java.util.Map;

import com.netflix.conductor.common.metadata.acl.Permission;

/**
 * A base class for {@link com.netflix.conductor.common.metadata.workflow.WorkflowDef} and {@link
 * com.netflix.conductor.common.metadata.tasks.TaskDef}.
 */
@Deprecated
public abstract class BaseDef extends Auditable {

    private final Map<Permission, String> accessPolicy = new EnumMap<>(Permission.class);

    public void addPermission(Permission permission, String allowedAuthority) {
        this.accessPolicy.put(permission, allowedAuthority);
    }

    public void addPermissionIfAbsent(Permission permission, String allowedAuthority) {
        this.accessPolicy.putIfAbsent(permission, allowedAuthority);
    }

    public void removePermission(Permission permission) {
        this.accessPolicy.remove(permission);
    }

    public String getAllowedAuthority(Permission permission) {
        return this.accessPolicy.get(permission);
    }

    public void clearAccessPolicy() {
        this.accessPolicy.clear();
    }

    public Map<Permission, String> getAccessPolicy() {
        return Collections.unmodifiableMap(this.accessPolicy);
    }

    public void setAccessPolicy(Map<Permission, String> accessPolicy) {
        this.accessPolicy.putAll(accessPolicy);
    }
}
