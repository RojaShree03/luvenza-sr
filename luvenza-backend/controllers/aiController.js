const getOutfitSuggestions = async (req, res) => {
    try {
        const {
            outfitType,
            fabric,
            color,
            sleeveDesign,
            neckDesign
        } = req.body;

        // Validate required fields
        if (!outfitType || !fabric || !color) {
            return res.status(400).json({
                success: false,
                message: 'Outfit type, fabric and color are required'
            });
        }

        const suggestions = [];

        // 1. Fabric-based suggestions
        const fabricRules = {
            silk: [
                'Gold zari embroidery',
                'Traditional woven border'
            ],
            cotton: [
                'Floral embroidery',
                'Printed border design'
            ],
            velvet: [
                'Heavy thread embroidery',
                'Stone embellishment'
            ],
            chiffon: [
                'Light floral embroidery',
                'Delicate lace border'
            ],
            georgette: [
                'Sequin embroidery',
                'Elegant border design'
            ]
        };

        const selectedFabric = fabric.toLowerCase();

        if (fabricRules[selectedFabric]) {
            suggestions.push(...fabricRules[selectedFabric]);
        } else {
            suggestions.push('Minimal embroidery design');
            suggestions.push('Simple matching border');
        }

        // 2. Color-based suggestions
        const colorRules = {
            maroon: ['Antique gold combination', 'Cream embroidery'],
            red: ['Gold embroidery', 'Traditional floral pattern'],
            blue: ['Silver embroidery', 'Pearl embellishment'],
            black: ['Gold thread work', 'Contrast border design'],
            green: ['Antique gold work', 'Traditional motifs'],
            pink: ['Rose gold embroidery', 'Floral pattern']
        };

        const selectedColor = color.toLowerCase();

        if (colorRules[selectedColor]) {
            suggestions.push(...colorRules[selectedColor]);
        }

        // 3. Sleeve-based suggestions
        const sleeveRules = {
            puff: 'Gold embroidered sleeve border',
            full: 'Detailed sleeve cuff embroidery',
            short: 'Decorative sleeve edging',
            elbow: 'Traditional sleeve border'
        };

        if (sleeveDesign) {
            const selectedSleeve = sleeveDesign.toLowerCase();

            if (sleeveRules[selectedSleeve]) {
                suggestions.push(sleeveRules[selectedSleeve]);
            }
        }

        // 4. Neck-based suggestions
        const neckRules = {
            boat: 'Traditional boat neck embroidery',
            v: 'V-neck decorative border',
            round: 'Round neck floral embroidery',
            sweetheart: 'Sweetheart neckline embellishment'
        };

        if (neckDesign) {
            const selectedNeck = neckDesign.toLowerCase();

            if (neckRules[selectedNeck]) {
                suggestions.push(neckRules[selectedNeck]);
            }
        }

        // Remove duplicate suggestions
        const uniqueSuggestions = [...new Set(suggestions)];

        return res.status(200).json({
            success: true,
            message: 'Outfit suggestions generated successfully',
            data: {
                outfitType,
                fabric,
                color,
                suggestions: uniqueSuggestions
            }
        });

    } catch (error) {
        console.error('Outfit Suggestions Error:', error);

        return res.status(500).json({
            success: false,
            message: 'Failed to generate outfit suggestions'
        });
    }
};

module.exports = {
    getOutfitSuggestions
};
