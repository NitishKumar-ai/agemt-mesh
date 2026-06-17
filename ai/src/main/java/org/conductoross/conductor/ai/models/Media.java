package org.conductoross.conductor.ai.models;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@AllArgsConstructor
@NoArgsConstructor
@Builder
public class Media {
    private String location;
    private byte[] data;
    private String mimeType;
}
