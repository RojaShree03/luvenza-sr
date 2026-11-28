require('dotenv').config();
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');

const User = require('../models/user');
const Category = require('../models/category');
const Product = require('../models/product');
const Collection = require('../models/collection');
const DesignComponent = require('../models/designComponent');
const Template = require('../models/template');
const Measurement = require('../models/measurement');
const Customization = require('../models/customization');
const Order = require('../models/order');
const Cart = require('../models/cart');
const Wishlist = require('../models/wishlist');

const DEMO_PASSWORD = 'LuvenzaDemo2026!';
const objectId = (number) => new mongoose.Types.ObjectId((0x670000000000000000000000n + BigInt(number)).toString(16).padStart(24, '0'));

async function seedById(Model, id, data) {
    return Model.findOneAndUpdate(
        { _id: id },
        { $setOnInsert: { _id: id, ...data } },
        { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true, runValidators: true }
    );
}

async function run() {
    if (process.env.ALLOW_DEMO_SEED !== '1') {
        throw new Error('Set ALLOW_DEMO_SEED=1 to confirm that demo records should be added.');
    }
    if (!process.env.MONGODB_URI) {
        throw new Error('MONGODB_URI is required. Configure it in luvenza-backend/.env.');
    }
    if (process.env.NODE_ENV === 'production') {
        throw new Error('Demo seeding is disabled when NODE_ENV=production.');
    }

    await mongoose.connect(process.env.MONGODB_URI);
    if (/(^|[-_])(prod|production|live)([-_]|$)/i.test(mongoose.connection.name)) {
        throw new Error('Demo seeding is disabled for production or live databases.');
    }

    const ids = {
        users: { admin: objectId(1), customers: [objectId(2), objectId(3), objectId(4)], tailor: objectId(5), delivery: objectId(6) },
        categories: [objectId(100), objectId(101), objectId(102)],
        products: [objectId(200), objectId(201), objectId(202)],
        collections: [objectId(300), objectId(301), objectId(302)],
        components: [objectId(400), objectId(401), objectId(402)],
        templates: [objectId(500), objectId(501), objectId(502)],
        measurements: [objectId(600), objectId(601), objectId(602)],
        customizations: [objectId(700), objectId(701), objectId(702)],
        orders: [objectId(800), objectId(801), objectId(802)],
        carts: [objectId(900), objectId(901), objectId(902)],
        wishlists: [objectId(1000), objectId(1001), objectId(1002)]
    };

    const password = await bcrypt.hash(DEMO_PASSWORD, 12);
    const users = [
        { _id: ids.users.admin, name: 'Luvenza Demo Admin', email: 'admin@luvenza.demo', phone: '+919800000001', password, role: 'admin', profileCompleted: true, isActive: true, isApproved: true },
        ...ids.users.customers.map((id, index) => ({ _id: id, name: `Demo Customer ${index + 1}`, email: `customer${index + 1}@luvenza.demo`, phone: `+91980000000${index + 2}`, password, role: 'customer', profileCompleted: true, isActive: true, isApproved: true, personalDetails: { firstName: `Demo`, lastName: `Customer ${index + 1}`, gender: 'female' }, address: { street: `${index + 1} Boutique Lane`, city: 'Bengaluru', state: 'Karnataka', country: 'India', pincode: '560001' } })),
        { _id: ids.users.tailor, name: 'Demo Master Tailor', email: 'tailor@luvenza.demo', phone: '+919800000005', password, role: 'tailor', profileCompleted: true, isActive: true, isApproved: true, availabilityStatus: 'busy', professionalDetails: { specialization: 'Bridal and occasion wear', experience: 8, portfolio: [] } },
        { _id: ids.users.delivery, name: 'Demo Delivery Partner', email: 'delivery@luvenza.demo', phone: '+919800000006', password, role: 'deliver_partner', profileCompleted: true, isActive: true, isApproved: true, availabilityStatus: 'busy', deliveryDetails: { vehicleType: 'Scooter', vehicleNumber: 'KA 01 DEMO', licenseNumber: 'DEMO-LIC-001' } }
    ];
    for (const user of users) await seedById(User, user._id, user);

    const categoryData = [
        ['Bespoke Kurtas', 'Made-to-measure kurtas for everyday elegance.'],
        ['Occasion Wear', 'Statement pieces for celebrations and events.'],
        ['Modern Classics', 'Timeless silhouettes with contemporary details.']
    ];
    for (let i = 0; i < 3; i++) await seedById(Category, ids.categories[i], { name: categoryData[i][0], description: categoryData[i][1], isActive: true });

    const products = [
        { productName: 'Mira Silk Kurta', rating: 4.8, reviewCount: 24, pricing: { newPrice: 3490, strikePrice: 4290, discountPercentage: 19 }, shortContent: ['Pure silk blend', 'Made to your measurements'], features: ['Soft silk blend', 'Hidden side pockets', 'Custom sleeve length'], availableSizes: ['XS', 'S', 'M', 'L', 'XL'], initialQuantity: 12, longDescription: 'A graceful silk-blend kurta tailored for a polished, comfortable fit.' },
        { productName: 'Aarohi Festive Set', rating: 4.9, reviewCount: 18, pricing: { newPrice: 5890, strikePrice: 6990, discountPercentage: 16 }, shortContent: ['Festive embroidered set', 'Choose your preferred details'], features: ['Hand-finished embroidery', 'Lined bodice', 'Custom colour options'], availableSizes: ['XS', 'S', 'M', 'L', 'XL'], initialQuantity: 8, longDescription: 'A celebration-ready set with delicate embroidery and a tailored silhouette.' },
        { productName: 'Nila Everyday Tunic', rating: 4.6, reviewCount: 31, pricing: { newPrice: 2490, strikePrice: 2990, discountPercentage: 17 }, shortContent: ['Breathable cotton', 'Easy everyday fit'], features: ['Cotton fabric', 'Side slits', 'Machine washable'], availableSizes: ['XS', 'S', 'M', 'L', 'XL'], initialQuantity: 20, longDescription: 'A versatile cotton tunic designed for relaxed everyday wear.' }
    ];
    for (let i = 0; i < 3; i++) await seedById(Product, ids.products[i], products[i]);

    const collections = [
        { name: 'Silk Edit', description: 'A curated selection of elegant silk looks.', coverImage: 'https://images.unsplash.com/photo-1610030469983-98e550d6193c?auto=format&fit=crop&w=1200&q=80', images: [], category: ids.categories[0], isActive: true },
        { name: 'Celebration Studio', description: 'Tailored occasion wear for your special moments.', coverImage: 'https://images.unsplash.com/photo-1617627143750-d86bc21e42bb?auto=format&fit=crop&w=1200&q=80', images: [], category: ids.categories[1], isActive: true },
        { name: 'Everyday Form', description: 'Comfortable shapes made with care.', coverImage: 'https://images.unsplash.com/photo-1583391733956-6c78276477e1?auto=format&fit=crop&w=1200&q=80', images: [], category: ids.categories[2], isActive: true }
    ];
    for (let i = 0; i < 3; i++) await seedById(Collection, ids.collections[i], collections[i]);

    const components = [
        { name: 'Mulberry Silk', type: 'fabric', description: 'Smooth silk blend with a soft sheen.', additionalCost: 1200, isAvailable: true },
        { name: 'Antique Gold', type: 'color', description: 'Warm gold tone for festive accents.', additionalCost: 350, isAvailable: true },
        { name: 'Three-quarter Sleeve', type: 'sleeve', description: 'A versatile sleeve length with a clean finish.', additionalCost: 0, isAvailable: true }
    ];
    for (let i = 0; i < 3; i++) await seedById(DesignComponent, ids.components[i], components[i]);

    const templates = [
        { name: 'Classic Straight Kurta', description: 'A clean straight-cut base for personal styling.', category: ids.categories[0], basePrice: 3290, availableSizes: ['XS', 'S', 'M', 'L', 'XL'], designOptions: { fabric: ['Cotton', 'Silk'], colors: ['Plum', 'Indigo'], sleeveStyles: ['Short', 'Three-quarter'], neckStyles: ['Round', 'V-neck'], patterns: ['Solid', 'Block print'] }, isActive: true },
        { name: 'Festive Anarkali', description: 'A flowing silhouette ready for celebration.', category: ids.categories[1], basePrice: 6290, availableSizes: ['XS', 'S', 'M', 'L', 'XL'], designOptions: { fabric: ['Silk', 'Chiffon'], colors: ['Ruby', 'Emerald'], sleeveStyles: ['Short', 'Full'], neckStyles: ['Sweetheart', 'Round'], patterns: ['Embroidered', 'Floral'] }, isActive: true },
        { name: 'Relaxed Everyday Tunic', description: 'A relaxed fit for easy everyday wear.', category: ids.categories[2], basePrice: 2290, availableSizes: ['XS', 'S', 'M', 'L', 'XL'], designOptions: { fabric: ['Cotton', 'Linen'], colors: ['Sage', 'Navy'], sleeveStyles: ['Short', 'Three-quarter'], neckStyles: ['Round', 'Split'], patterns: ['Solid', 'Stripe'] }, isActive: true }
    ];
    for (let i = 0; i < 3; i++) await seedById(Template, ids.templates[i], templates[i]);

    const measurements = [
        { profileName: 'Everyday Fit', measurements: { height: 164, bust: 91, waist: 74, hip: 98, shoulder: 38, sleeveLength: 43, armhole: 42, dressLength: 102, unit: 'cm' } },
        { profileName: 'Occasion Fit', measurements: { height: 159, bust: 86, waist: 69, hip: 94, shoulder: 36, sleeveLength: 45, armhole: 40, dressLength: 108, unit: 'cm' } },
        { profileName: 'Relaxed Fit', measurements: { height: 170, bust: 96, waist: 81, hip: 104, shoulder: 40, sleeveLength: 44, armhole: 44, dressLength: 100, unit: 'cm' } }
    ];
    for (let i = 0; i < 3; i++) await seedById(Measurement, ids.measurements[i], { userId: ids.users.customers[i], ...measurements[i] });

    const customizations = [
        { customizationName: 'Plum Silk Kurta', designOptions: { fabric: 'Mulberry silk', color: 'Plum', sleeve: 'Three-quarter' }, status: 'pending_review', designerReview: {} },
        { customizationName: 'Aarohi Wedding Set', designOptions: { fabric: 'Silk', color: 'Ruby', sleeve: 'Full', embroidery: 'Antique gold' }, status: 'approved', designerReview: { notes: 'Ready for tailoring.', suggestedFabric: 'Silk', estimatedCost: 7200, reviewedAt: new Date() }, assignedTailor: ids.users.tailor },
        { customizationName: 'Nila Sage Tunic', designOptions: { fabric: 'Cotton', color: 'Sage', sleeve: 'Short' }, status: 'in_progress', designerReview: { notes: 'Pattern is being prepared.', estimatedCost: 2490, reviewedAt: new Date() }, assignedTailor: ids.users.tailor }
    ];
    for (let i = 0; i < 3; i++) await seedById(Customization, ids.customizations[i], { userId: ids.users.customers[i], productId: ids.products[i], measurementId: ids.measurements[i], ...customizations[i] });

    const orderData = [
        { customerId: ids.users.customers[0], customizationId: ids.customizations[0], totalAmount: 3490, status: 'placed' },
        { customerId: ids.users.customers[1], customizationId: ids.customizations[1], assignedTailor: ids.users.tailor, totalAmount: 7200, status: 'tailoring' },
        { customerId: ids.users.customers[2], customizationId: ids.customizations[2], assignedTailor: ids.users.tailor, assignedDeliveryPartner: ids.users.delivery, totalAmount: 2490, status: 'out_for_delivery', deliveryDetails: { pickedUpAt: new Date(), deliveryAddress: '3 Boutique Lane, Bengaluru', trackingNote: 'On the way to the customer.' }, activityHistory: [{ performedBy: ids.users.delivery, role: 'deliver_partner', action: 'out_for_delivery', description: 'Demo order is out for delivery.' }] }
    ];
    for (let i = 0; i < 3; i++) await seedById(Order, ids.orders[i], { ...orderData[i], payment: { status: 'not_started', currency: 'INR' } });

    for (let i = 0; i < 3; i++) {
        await seedById(Cart, ids.carts[i], { userId: ids.users.customers[i], items: [{ productId: ids.products[i], quantity: i + 1, selectedSize: ['M', 'S', 'L'][i] }] });
        await seedById(Wishlist, ids.wishlists[i], { userId: ids.users.customers[i], products: [{ productId: ids.products[(i + 1) % 3] }] });
    }

    const seededCounts = await Promise.all([
        User.countDocuments({ email: /@luvenza\.demo$/ }), Category.countDocuments({ _id: { $in: ids.categories } }), Product.countDocuments({ _id: { $in: ids.products } }), Collection.countDocuments({ _id: { $in: ids.collections } }), DesignComponent.countDocuments({ _id: { $in: ids.components } }), Template.countDocuments({ _id: { $in: ids.templates } }), Measurement.countDocuments({ _id: { $in: ids.measurements } }), Customization.countDocuments({ _id: { $in: ids.customizations } }), Order.countDocuments({ _id: { $in: ids.orders } }), Cart.countDocuments({ _id: { $in: ids.carts } }), Wishlist.countDocuments({ _id: { $in: ids.wishlists } })
    ]);
    const names = ['users (includes dashboard roles)', 'categories', 'products', 'collections', 'design components', 'templates', 'measurements', 'customizations', 'orders', 'carts', 'wishlists'];
    console.log('Luvenza demo data is ready:');
    names.forEach((name, index) => console.log(`  ${name}: ${seededCounts[index]}`));
    console.log(`Demo login password: ${DEMO_PASSWORD}`);
    console.log('Demo logins: admin@luvenza.demo, customer1@luvenza.demo, customer2@luvenza.demo, customer3@luvenza.demo, tailor@luvenza.demo, delivery@luvenza.demo');
}

run()
    .catch((error) => {
        console.error('Demo seed failed:', error.message);
        process.exitCode = 1;
    })
    .finally(async () => {
        await mongoose.disconnect();
    });
