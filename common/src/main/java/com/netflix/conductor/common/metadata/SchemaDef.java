package com.netflix.conductor.common.metadata;

import java.util.Map;

import com.netflix.conductor.annotations.protogen.ProtoEnum;
import com.netflix.conductor.annotations.protogen.ProtoField;
import com.netflix.conductor.annotations.protogen.ProtoMessage;

import jakarta.validation.constraints.NotNull;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;

@EqualsAndHashCode(callSuper = true)
@Builder
@Data
@NoArgsConstructor
@AllArgsConstructor
@ProtoMessage
public class SchemaDef extends Auditable {

    @ProtoEnum
    public enum Type {
        JSON,
        AVRO,
        PROTOBUF
    }

    @ProtoField(id = 1)
    @NotNull
    private String name;

    @ProtoField(id = 2)
    @NotNull
    @Builder.Default
    private int version = 1;

    @ProtoField(id = 3)
    @NotNull
    private Type type;

    // Schema definition stored here
    private Map<String, Object> data;

    // Externalized schema definition (eg. via AVRO, Protobuf registry)
    // If using Orkes Schema registry, this points to the name of the schema in the registry
    private String externalRef;
}
