package org.conductoross.conductor.ai.document;

/**
 * Thrown when a document access request is blocked by {@link DocumentAccessPolicy} due to the
 * location matching a blocked path, file name, or host.
 */
public class DocumentAccessDeniedException extends SecurityException {

    public DocumentAccessDeniedException(String message) {
        super(message);
    }
}
