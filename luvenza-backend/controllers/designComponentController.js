const DesignComponent = require("../models/designComponent");

// POST /api/design-components
exports.createDesignComponent = async (req, res) => {
    try {
        const component = await DesignComponent.create(req.body);

        res.status(201).json({
            message: "Design component created successfully",
            component
        });
    } catch (error) {
        res.status(400).json({
            message: "Failed to create component",
            error: error.message
        });
    }
};

// GET /api/design-components
exports.getDesignComponents = async (req, res) => {
    try {
        const filter = {};

        if (req.query.type) {
            filter.type = req.query.type;
        }

        if (req.query.available === "true") {
            filter.isAvailable = true;
        }

        const components = await DesignComponent.find(filter)
            .sort({ createdAt: -1 });

        res.status(200).json({
            count: components.length,
            components
        });
    } catch (error) {
        res.status(500).json({
            message: "Failed to fetch components",
            error: error.message
        });
    }
};