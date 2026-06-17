package org.conductoross.conductor.ai.models;

import java.util.HashMap;
import java.util.Map;

import lombok.Data;

@Data
public class IndexedDoc {
    private String docId;
    private String parentDocId;
    private String text;
    private double score;
    private Map<String, Object> metadata = new HashMap<>();

    public IndexedDoc(String docId, String parentDocId, String text, double score) {
        this.docId = docId;
        this.parentDocId = parentDocId;
        this.text = text;
        this.score = score;
    }

    public IndexedDoc() {}
}
