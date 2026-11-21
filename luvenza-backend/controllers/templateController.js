const Template = require("../models/template");

// POST /api/templates
exports.createTemplate = async (req, res) => {
    try {
        const template = await Template.create(req.body);

        res.status(201).json({
            message: "Template created successfully",
            template
        });
    } catch (error) {
        res.status(400).json({
            message: "Failed to create template",
            error: error.message
        });
    }
};

// GET /api/templates
exports.getTemplates = async (req, res) => {
    try {
        const templates = await Template.find({
            isActive: true
        })
            .populate("category")
            .sort({ createdAt: -1 });

        res.status(200).json({
            count: templates.length,
            templates
        });
    } catch (error) {
        res.status(500).json({
            message: "Failed to fetch templates",
            error: error.message
        });
    }
};