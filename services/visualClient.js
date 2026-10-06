/**
 * ShaadiSahulat - Visual Recommendation Service (Node.js → Python ML)
 * =====================================================================
 * Forwards image uploads to the Python Flask ML microservice,
 * handles timeouts, parses responses, queries MongoDB for product details,
 * and formats the final JSON response for the React frontend.
 */

const axios = require("axios");
const FormData = require("form-data");
const VisualRecommendation = require("../models/VisualRecommendation");

const ML_SERVICE_URL  = process.env.VISUAL_ML_URL || "http://localhost:5002";
const REQUEST_TIMEOUT = 30000;

/**
 * Send image to Python ML service for recommendation
 */
async function getRecommendation(imageBuffer, originalname, mimetype, preferredCategory = null, limit = 10, description = "") {
  try {
    const formData = new FormData();
    formData.append("image", imageBuffer, {
      filename: originalname || "upload.jpg",
      contentType: mimetype || "image/jpeg",
    });

    if (preferredCategory) {
      formData.append("preferred_category", preferredCategory);
    }
    if (description) {
      formData.append("description", description);
    }
    formData.append("limit", String(limit));

    const response = await axios.post(
      `${ML_SERVICE_URL}/visual/recommend`,
      formData,
      {
        headers: {
          ...formData.getHeaders(),
        },
        timeout: REQUEST_TIMEOUT,
      }
    );

    return response.data;
  } catch (error) {
    if (error.code === "ECONNREFUSED") {
      console.error("[VisualClient] ML service unavailable at", ML_SERVICE_URL);
      return {
        status: "error",
        reason: "Visual recommendation service is not running. Please start the Python ML service on port 5002.",
        service_url: ML_SERVICE_URL,
      };
    }
    if (error.response) {
      // ML service returned an error (prefer JSON body; never forward HTML)
      const data = error.response.data;
      if (data && typeof data === "object") return data;
      return {
        status: "error",
        stage: "service",
        reason:
          error.response.status === 503
            ? "Visual ML model unavailable. Start with npm run dev:visual (PyTorch required)."
            : `Visual ML service returned HTTP ${error.response.status}.`,
        suggestion: "Restart visual-ml-service with the project venv: npm run dev:visual",
      };
    }
    console.error("[VisualClient] Error:", error.message);
    return {
      status: "error",
      reason: `Failed to get recommendation: ${error.message}`,
    };
  }
}

/**
 * Format ML results directly — no secondary DB query needed.
 * The Flask ML service now returns full product fields in each result.
 */
function enrichResults(mlResults) {
  if (!mlResults.results || mlResults.results.length === 0) {
    return mlResults;
  }

  mlResults.results = mlResults.results.map((result, index) => {
    // Resolve image URL: relative paths need the ML service base prepended
    let imageUrl = result.image_url || result.image_path || "";
    if (imageUrl && imageUrl.startsWith("/")) {
      imageUrl = `${ML_SERVICE_URL}${imageUrl}`;
    }

    return {
      rank:             index + 1,
      product_id:       result.product_id,
      title:            result.title        || result.product_id,
      category:         result.category     || "",
      description:      result.description  || "",
      image_url:        imageUrl,
      price:            result.price        || 0,
      discount_price:   result.discount_price || null,
      seller_name:      result.seller_name  || "",
      seller_id:        result.seller_id    || "",
      hybrid_score:     result.hybrid_score || 0,
      image_similarity: result.image_similarity || 0,
      text_similarity:  result.text_similarity  || 0,
      match_percentage: result.match_percentage || 0,
      match_badge:      `${result.match_percentage || 0}% Match`,
    };
  });

  return mlResults;
}

/**
 * Log a recommendation request to MongoDB
 */
async function logRecommendation(userId, mlResult, preferredCategory = null, imageSizeKb = 0) {
  try {
    const log = new VisualRecommendation({
      user_id: userId,
      predicted_category: mlResult.validation?.predicted_category || null,
      confidence: mlResult.validation?.confidence || 0,
      stage1_passed: mlResult.validation?.stage1_passed || false,
      stage2_passed: mlResult.validation?.stage2_passed || false,
      status: mlResult.status,
      rejection_stage: mlResult.stage || null,
      rejection_reason: mlResult.reason || null,
      results_count: mlResult.results?.length || 0,
      top_results: (mlResult.results || []).slice(0, 5).map((r) => ({
        product_id: r.product_id,
        similarity_score: r.similarity_score,
        match_percentage: r.match_percentage,
      })),
      search_time_ms: mlResult.search_metadata?.search_time_ms || 0,
      preferred_category: preferredCategory,
      image_size_kb: imageSizeKb,
    });

    await log.save();
    return log;
  } catch (error) {
    console.error("[VisualClient] Failed to log recommendation:", error.message);
    return null;
  }
}

/**
 * Get ML service health status
 */
async function getMLHealth() {
  try {
    const response = await axios.get(`${ML_SERVICE_URL}/health`, {
      timeout: 5000,
    });
    return response.data;
  } catch {
    return {
      status: "unavailable",
      service: "shaadi-sahulat-visual-ml",
      model_loaded: false,
      index_built: false,
    };
  }
}

/**
 * Get dataset status from ML service
 */
async function getDatasetStatus() {
  try {
    const response = await axios.get(`${ML_SERVICE_URL}/visual/dataset-status`, {
      timeout: 5000,
    });
    return response.data;
  } catch {
    return { success: false, error: "ML service unavailable" };
  }
}

/**
 * Get embedding index stats from ML service
 */
async function getIndexStats() {
  try {
    const response = await axios.get(`${ML_SERVICE_URL}/visual/index-stats`, {
      timeout: 5000,
    });
    return response.data;
  } catch {
    return { success: false, error: "ML service unavailable" };
  }
}

/**
 * Get supported categories from ML service
 */
async function getCategories() {
  try {
    const response = await axios.get(`${ML_SERVICE_URL}/visual/categories`, {
      timeout: 5000,
    });
    return response.data;
  } catch {
    return {
      categories: [
        { id: "bridal_lehenga", label: "Bridal Lehenga", type: "bridal" },
        { id: "bridal_sharara", label: "Bridal Sharara", type: "bridal" },
        { id: "bridal_gown", label: "Bridal Gown", type: "bridal" },
        { id: "bridal_saree", label: "Bridal Saree", type: "bridal" },
        { id: "bridal_maxi", label: "Bridal Maxi", type: "bridal" },
        { id: "groom_sherwani", label: "Groom Sherwani", type: "groom" },
        { id: "groom_shalwar_kameez", label: "Groom Shalwar Kameez", type: "groom" },
        { id: "groom_prince_coat", label: "Prince Coat", type: "groom" },
      ],
      total: 8,
    };
  }
}

/**
 * Size-aware virtual try-on → Python ML service
 */
async function runTryOn({
  personBuffer,
  personName,
  personMime,
  garmentBuffer,
  garmentName,
  garmentMime,
  fields = {},
}) {
  try {
    const formData = new FormData();
    formData.append("person", personBuffer, {
      filename: personName || "person.jpg",
      contentType: personMime || "image/jpeg",
    });
    if (garmentBuffer) {
      formData.append("garment", garmentBuffer, {
        filename: garmentName || "garment.jpg",
        contentType: garmentMime || "image/jpeg",
      });
    }
    for (const [k, v] of Object.entries(fields)) {
      if (v !== undefined && v !== null && v !== "") {
        formData.append(k, String(v));
      }
    }

    const response = await axios.post(`${ML_SERVICE_URL}/tryon/preview`, formData, {
      headers: formData.getHeaders(),
      timeout: 210000,
      maxContentLength: 25 * 1024 * 1024,
    });
    return response.data;
  } catch (error) {
    if (error.code === "ECONNREFUSED") {
      return {
        success: false,
        error: "Visual ML service is not running on port 5002.",
      };
    }
    if (error.response?.data) return error.response.data;
    return { success: false, error: error.message };
  }
}

async function runTryOnFit(body) {
  try {
    const response = await axios.post(`${ML_SERVICE_URL}/tryon/fit`, body, {
      timeout: 15000,
    });
    return response.data;
  } catch (error) {
    if (error.response?.data) return error.response.data;
    return { success: false, error: error.message };
  }
}

async function getTryOnHealth() {
  try {
    const response = await axios.get(`${ML_SERVICE_URL}/tryon/health`, {
      timeout: 5000,
    });
    return response.data;
  } catch (error) {
    return { status: "error", error: error.message };
  }
}

module.exports = {
  getRecommendation,
  enrichResults,
  logRecommendation,
  getMLHealth,
  getDatasetStatus,
  getIndexStats,
  getCategories,
  runTryOn,
  runTryOnFit,
  getTryOnHealth,
};
