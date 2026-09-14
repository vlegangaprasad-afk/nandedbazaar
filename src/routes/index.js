const router = require('express').Router();

router.use('/auth', require('./auth.routes'));
router.use('/', require('./registration.routes')); // POST /vendors/register, /providers/register
router.use('/stores', require('./stores.routes'));
router.use('/products', require('./products.routes'));
router.use('/providers', require('./providers.routes'));
router.use('/services', require('./services.routes'));
router.use('/enquiries', require('./enquiries.routes'));
router.use('/vendor', require('./vendor.routes'));
router.use('/provider', require('./provider.routes'));
router.use('/customer', require('./customer.routes'));
router.use('/categories', require('./categories.routes'));
router.use('/service-categories', require('./serviceCategories.routes'));
router.use('/cities', require('./cities.routes'));
router.use('/areas', require('./areas.routes'));
router.use('/search', require('./search.routes'));
router.use('/track', require('./tracking.routes'));
router.use('/uploads', require('./uploads.routes'));

module.exports = router;
