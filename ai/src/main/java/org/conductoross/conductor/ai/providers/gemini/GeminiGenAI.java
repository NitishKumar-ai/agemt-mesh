package org.conductoross.conductor.ai.providers.gemini;

import java.util.ArrayList;
import java.util.List;

import org.conductoross.conductor.ai.providers.gemini.api.GeminiApi;
import org.springframework.ai.image.ImageGeneration;
import org.springframework.ai.image.ImageModel;
import org.springframework.ai.image.ImagePrompt;
import org.springframework.ai.image.ImageResponse;

public class GeminiGenAI implements ImageModel {

    private final GeminiApi api;

    public GeminiGenAI(GeminiApi api) {
        this.api = api;
    }

    @Override
    public ImageResponse call(ImagePrompt request) {
        var options = request.getOptions();
        String model = options.getModel();
        String promptText = request.getInstructions().getFirst().getText();

        GeminiApi.GenerateImagesConfig config =
                new GeminiApi.GenerateImagesConfig(options.getN(), "image/png", true);

        GeminiApi.GenerateImagesResponse response;
        try {
            response = api.generateImages(model, promptText, config);
        } catch (java.io.IOException e) {
            throw new RuntimeException("Gemini generateImages failed: " + e.getMessage(), e);
        }

        List<GeminiApi.ImagePrediction> predictions =
                response.predictions() != null ? response.predictions() : List.of();
        List<ImageGeneration> generations = new ArrayList<>();
        for (GeminiApi.ImagePrediction pred : predictions) {
            if (pred.bytesBase64Encoded() != null) {
                org.springframework.ai.image.Image img =
                        new org.springframework.ai.image.Image(null, pred.bytesBase64Encoded());
                generations.add(new ImageGeneration(img));
            }
        }
        return new ImageResponse(generations);
    }
}
