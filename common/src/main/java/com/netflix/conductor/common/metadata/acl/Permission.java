package com.netflix.conductor.common.metadata.acl;

import com.netflix.conductor.annotations.protogen.ProtoEnum;

@ProtoEnum
@Deprecated
public enum Permission {
    OWNER,
    OPERATOR
}
