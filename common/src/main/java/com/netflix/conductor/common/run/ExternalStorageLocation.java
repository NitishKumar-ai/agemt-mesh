package com.netflix.conductor.common.run;

/**
 * Describes the location where the JSON payload is stored in external storage.
 *
 * <p>The location is described using the following fields:
 *
 * <ul>
 *   <li>uri: The uri of the json file in external storage.
 *   <li>path: The relative path of the file in external storage.
 * </ul>
 */
public class ExternalStorageLocation {

    private String uri;
    private String path;

    public String getUri() {
        return uri;
    }

    public void setUri(String uri) {
        this.uri = uri;
    }

    public String getPath() {
        return path;
    }

    public void setPath(String path) {
        this.path = path;
    }

    @Override
    public String toString() {
        return "ExternalStorageLocation{" + "uri='" + uri + '\'' + ", path='" + path + '\'' + '}';
    }
}
