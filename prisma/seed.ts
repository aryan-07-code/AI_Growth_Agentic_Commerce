/* eslint-disable @typescript-eslint/no-require-imports */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding AgentReady database...');

  // ─── MERCHANTS ─────────────────────────────────────────────────────────────

  const urbanTrail = await prisma.merchant.upsert({
    where: { slug: 'urbantrail' },
    update: {},
    create: {
      name: 'UrbanTrail',
      slug: 'urbantrail',
      description: 'Premium travel bags and backpacks for the modern explorer.',
      email: 'store@urbantrail.in',
      website: 'https://urbantrail.in',
      active: true,
    },
  });

  const runPro = await prisma.merchant.upsert({
    where: { slug: 'runpro' },
    update: {},
    create: {
      name: 'RunPro',
      slug: 'runpro',
      description: 'Running shoes and fitness products for serious athletes.',
      email: 'store@runpro.in',
      website: 'https://runpro.in',
      active: true,
    },
  });

  const techNest = await prisma.merchant.upsert({
    where: { slug: 'technest' },
    update: {},
    create: {
      name: 'TechNest',
      slug: 'technest',
      description: 'Premium electronics and accessories for the tech-savvy.',
      email: 'store@technest.in',
      website: 'https://technest.in',
      active: true,
    },
  });

  // ─── MERCHANT POLICIES (DELIVERY) ──────────────────────────────────────────

  // UrbanTrail delivery policies
  const utDeliveryPolicies = [
    { key: 'bangalore_delivery', value: { minDays: 1, maxDays: 2, fee: 0, available: true } },
    { key: 'mumbai_delivery', value: { minDays: 2, maxDays: 3, fee: 0, available: true } },
    { key: 'delhi_delivery', value: { minDays: 2, maxDays: 4, fee: 0, available: true } },
    { key: 'hyderabad_delivery', value: { minDays: 2, maxDays: 3, fee: 0, available: true } },
    { key: 'chennai_delivery', value: { minDays: 2, maxDays: 3, fee: 0, available: true } },
    { key: 'kolkata_delivery', value: { minDays: 3, maxDays: 5, fee: 0, available: true } },
  ];

  for (const policy of utDeliveryPolicies) {
    await prisma.merchantPolicy.upsert({
      where: { id: `urbantrail-${policy.key}` },
      update: { value: policy.value },
      create: {
        id: `urbantrail-${policy.key}`,
        merchantId: urbanTrail.id,
        type: 'DELIVERY',
        key: policy.key,
        value: policy.value,
        description: `UrbanTrail ${policy.key.replace(/_/g, ' ')}`,
      },
    });
  }

  // TravelPro (under TechNest merchant) delivery policies - slower
  const tpDeliveryPolicies = [
    { key: 'bangalore_delivery', value: { minDays: 5, maxDays: 7, fee: 49, available: true } },
    { key: 'mumbai_delivery', value: { minDays: 4, maxDays: 6, fee: 49, available: true } },
    { key: 'delhi_delivery', value: { minDays: 5, maxDays: 8, fee: 49, available: true } },
  ];

  // RunPro delivery policies
  const rpDeliveryPolicies = [
    { key: 'bangalore_delivery', value: { minDays: 2, maxDays: 3, fee: 0, available: true } },
    { key: 'mumbai_delivery', value: { minDays: 2, maxDays: 4, fee: 0, available: true } },
    { key: 'delhi_delivery', value: { minDays: 3, maxDays: 5, fee: 0, available: true } },
  ];

  for (const policy of rpDeliveryPolicies) {
    await prisma.merchantPolicy.upsert({
      where: { id: `runpro-${policy.key}` },
      update: { value: policy.value },
      create: {
        id: `runpro-${policy.key}`,
        merchantId: runPro.id,
        type: 'DELIVERY',
        key: policy.key,
        value: policy.value,
      },
    });
  }

  // TechNest delivery
  const tnDeliveryPolicies = [
    { key: 'bangalore_delivery', value: { minDays: 1, maxDays: 2, fee: 0, available: true } },
    { key: 'mumbai_delivery', value: { minDays: 1, maxDays: 3, fee: 0, available: true } },
    { key: 'delhi_delivery', value: { minDays: 2, maxDays: 3, fee: 0, available: true } },
  ];

  for (const policy of tnDeliveryPolicies) {
    await prisma.merchantPolicy.upsert({
      where: { id: `technest-${policy.key}` },
      update: { value: policy.value },
      create: {
        id: `technest-${policy.key}`,
        merchantId: techNest.id,
        type: 'DELIVERY',
        key: policy.key,
        value: policy.value,
      },
    });
  }

  // ─── URBANTRAIL PRODUCTS ────────────────────────────────────────────────────

  // PRODUCT A — Main demo hero (passes all constraints for main demo query)
  const productA = await prisma.product.upsert({
    where: { id: 'product-urbantrail-35l-waterproof' },
    update: {},
    create: {
      id: 'product-urbantrail-35l-waterproof',
      merchantId: urbanTrail.id,
      sku: 'UT-BP-35L-BLK',
      title: 'UrbanTrail 35L Waterproof Backpack',
      description:
        'Built for the urban explorer who doesn\'t compromise. The UrbanTrail 35L features a fully waterproof shell, padded 15.6" laptop compartment, and ergonomic shoulder system. Whether you\'re commuting, trekking, or traveling, this bag handles it all.',
      category: 'backpacks',
      priceInr: 3499,
      inventory: 17,
      warrantyMonths: 24,
      returnDays: 30,
      attributes: {
        capacity_litres: 35,
        waterproof: true,
        water_resistant: true,
        laptop_size_inches: 15.6,
        material: 'polyester',
        color: ['black', 'navy', 'olive'],
        use_cases: ['travel', 'trekking', 'college', 'commute'],
        weight_grams: 850,
        closure_type: 'zipper',
        back_padding: true,
        chest_strap: true,
        hip_belt: true,
        side_pockets: 2,
        number_of_compartments: 3,
      },
      aiMetadata: {
        searchTerms: [
          'waterproof backpack',
          'laptop bag',
          '35L bag',
          'travel backpack',
          'trekking bag',
          'college bag',
          'rain proof bag',
          'commuter backpack',
          '15 inch laptop bag',
        ],
        semanticSummary:
          'Premium waterproof 35L backpack suitable for college, travel, and trekking. Fits 15.6 inch laptop. 2 year warranty with 30 day returns.',
        buyerIntents: [
          'need a waterproof bag for travel',
          'want a backpack that fits my laptop',
          'looking for a durable bag for daily use',
          'need a bag that survives rain',
        ],
      },
      images: ['/images/products/urbantrail-35l.jpg'],
    },
  });

  // Add variant
  await prisma.productVariant.upsert({
    where: { id: 'variant-ut-35l-black' },
    update: {},
    create: {
      id: 'variant-ut-35l-black',
      productId: productA.id,
      name: '35L / Black',
      sku: 'UT-BP-35L-BLK-V1',
      priceInr: 3499,
      inventory: 10,
      attributes: { color: 'black', size: '35L' },
    },
  });

  // PRODUCT B — Fails delivery constraint (5-7 days to Bangalore)
  const productB = await prisma.product.upsert({
    where: { id: 'product-travelpro-rainshield-30l' },
    update: {},
    create: {
      id: 'product-travelpro-rainshield-30l',
      merchantId: urbanTrail.id,
      sku: 'UT-TP-30L-GRY',
      title: 'TravelPro RainShield 30L',
      description:
        'The TravelPro RainShield offers excellent waterproofing at an accessible price point. Compact 30L size with laptop sleeve. Ships via economy delivery.',
      category: 'backpacks',
      priceInr: 2999,
      inventory: 12,
      warrantyMonths: 12,
      returnDays: 15,
      attributes: {
        capacity_litres: 30,
        waterproof: true,
        water_resistant: true,
        laptop_size_inches: 15.0,
        material: 'nylon',
        color: ['grey', 'black'],
        use_cases: ['travel', 'college'],
        weight_grams: 720,
        // Slow delivery — stored in merchant policy override
        delivery_override: {
          bangalore: { minDays: 5, maxDays: 7, fee: 49 },
        },
      },
      aiMetadata: {
        searchTerms: [
          'waterproof backpack',
          'rainshield bag',
          '30L bag',
          'budget waterproof bag',
          'affordable backpack',
        ],
        semanticSummary:
          'Budget-friendly waterproof 30L backpack. Economy shipping — 5-7 business days to Bangalore.',
        buyerIntents: [
          'need a waterproof bag under 3000',
          'affordable rain proof backpack',
        ],
      },
      images: ['/images/products/travelpro-30l.jpg'],
    },
  });

  // PRODUCT C — Fails waterproof constraint (only water resistant)
  const productC = await prisma.product.upsert({
    where: { id: 'product-trekmax-everyday-32l' },
    update: {},
    create: {
      id: 'product-trekmax-everyday-32l',
      merchantId: urbanTrail.id,
      sku: 'UT-TM-32L-GRN',
      title: 'TrekMax Everyday 32L',
      description:
        'Versatile everyday backpack with padded laptop compartment and water-resistant shell. Great for daily use but not designed for heavy rain.',
      category: 'backpacks',
      priceInr: 3799,
      inventory: 9,
      warrantyMonths: 18,
      returnDays: 30,
      attributes: {
        capacity_litres: 32,
        waterproof: false,        // NOT waterproof — fails hard constraint
        water_resistant: true,    // Only water resistant
        laptop_size_inches: 15.6,
        material: 'canvas',
        color: ['green', 'tan', 'black'],
        use_cases: ['college', 'commute', 'light-travel'],
        weight_grams: 790,
      },
      aiMetadata: {
        searchTerms: [
          'everyday backpack',
          '32L bag',
          'campus bag',
          'water resistant backpack',
          'college backpack',
        ],
        semanticSummary:
          'Everyday 32L backpack with water resistance (not fully waterproof). Good for dry conditions and light rain. Fast 1-2 day delivery to Bangalore.',
        buyerIntents: [
          'need a college bag',
          'daily commuter backpack',
          'stylish everyday bag',
        ],
      },
      images: ['/images/products/trekmax-32l.jpg'],
    },
  });

  // More UrbanTrail products
  const utProducts = [
    {
      id: 'product-ut-20l-daypack',
      sku: 'UT-DP-20L-BLU',
      title: 'UrbanTrail 20L City Daypack',
      description: 'Compact daypack for city exploration. Lightweight and stylish.',
      category: 'backpacks',
      priceInr: 1999,
      inventory: 25,
      warrantyMonths: 12,
      returnDays: 15,
      attributes: {
        capacity_litres: 20,
        waterproof: false,
        water_resistant: true,
        laptop_size_inches: 13,
        material: 'polyester',
        use_cases: ['city', 'commute', 'day-trips'],
        weight_grams: 450,
      },
    },
    {
      id: 'product-ut-50l-expedition',
      sku: 'UT-EX-50L-RED',
      title: 'UrbanTrail 50L Expedition Pack',
      description: 'Heavy-duty expedition backpack for multi-day treks. Fully waterproof with frame support.',
      category: 'backpacks',
      priceInr: 5999,
      inventory: 6,
      warrantyMonths: 36,
      returnDays: 30,
      attributes: {
        capacity_litres: 50,
        waterproof: true,
        laptop_size_inches: 15.6,
        material: 'ripstop-nylon',
        use_cases: ['trekking', 'expedition', 'camping'],
        weight_grams: 1450,
        hip_belt: true,
        frame: 'internal',
      },
    },
    {
      id: 'product-ut-laptop-sleeve',
      sku: 'UT-LS-156-BLK',
      title: 'UrbanTrail 15.6" Laptop Sleeve',
      description: 'Padded laptop sleeve with waterproof outer shell. Fits inside most 35L+ backpacks.',
      category: 'accessories',
      priceInr: 799,
      inventory: 50,
      warrantyMonths: 6,
      returnDays: 7,
      attributes: {
        laptop_size_inches: 15.6,
        waterproof: true,
        material: 'neoprene',
        use_cases: ['laptop-protection'],
      },
    },
    {
      id: 'product-ut-travel-pillow',
      sku: 'UT-TP-GRY',
      title: 'UrbanTrail Memory Foam Travel Pillow',
      description: 'Ergonomic travel pillow with washable cover. Perfect for flights and road trips.',
      category: 'accessories',
      priceInr: 599,
      inventory: 100,
      warrantyMonths: 6,
      returnDays: 15,
      attributes: {
        material: 'memory-foam',
        use_cases: ['travel', 'flight'],
        weight_grams: 250,
      },
    },
    {
      id: 'product-ut-packing-cubes',
      sku: 'UT-PC-SET4-BLU',
      title: 'UrbanTrail Packing Cubes (Set of 4)',
      description: 'Lightweight packing cubes for organized travel. Water resistant. Set of 4 sizes.',
      category: 'accessories',
      priceInr: 999,
      inventory: 45,
      warrantyMonths: 12,
      returnDays: 15,
      attributes: {
        water_resistant: true,
        set_count: 4,
        material: 'polyester',
        use_cases: ['travel', 'organization'],
      },
    },
  ];

  for (const p of utProducts) {
    await prisma.product.upsert({
      where: { id: p.id },
      update: {},
      create: { ...p, merchantId: urbanTrail.id, images: [] } as any,
    });
  }

  // ─── RUNPRO PRODUCTS ────────────────────────────────────────────────────────

  const runProProducts = [
    {
      id: 'product-rp-elite-runner-v2',
      sku: 'RP-SHOE-ER2-BLK-10',
      title: 'RunPro Elite Runner V2',
      description: 'Professional marathon running shoe with carbon fiber plate. Responsive foam sole for maximum energy return.',
      category: 'footwear',
      priceInr: 4999,
      inventory: 20,
      warrantyMonths: 6,
      returnDays: 30,
      attributes: {
        shoe_size: [6, 7, 8, 9, 10, 11, 12],
        sole_material: 'carbon-fiber-reinforced',
        upper_material: 'mesh',
        use_cases: ['marathon', 'road-running', 'racing'],
        weight_grams: 198,
        drop_mm: 8,
        stack_height_mm: 39,
        pronation_support: 'neutral',
      },
    },
    {
      id: 'product-rp-trail-blazer',
      sku: 'RP-SHOE-TB-GRN-9',
      title: 'RunPro TrailBlazer Trail Shoe',
      description: 'Rugged trail running shoe with aggressive lugs and waterproof Gore-Tex liner.',
      category: 'footwear',
      priceInr: 3999,
      inventory: 15,
      warrantyMonths: 6,
      returnDays: 30,
      attributes: {
        waterproof: true,
        sole_material: 'vibram',
        use_cases: ['trail-running', 'hiking', 'outdoor'],
        weight_grams: 280,
        lug_depth_mm: 5,
        gore_tex: true,
      },
    },
    {
      id: 'product-rp-speed-shorts',
      sku: 'RP-APP-SS-BLK-M',
      title: 'RunPro Speed Shorts',
      description: '4" inseam lightweight running shorts with built-in liner and rear zipper pocket.',
      category: 'apparel',
      priceInr: 1299,
      inventory: 40,
      warrantyMonths: 3,
      returnDays: 15,
      attributes: {
        material: 'recycled-polyester',
        inseam_inches: 4,
        built_in_liner: true,
        use_cases: ['running', 'gym', 'training'],
        sizes: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
      },
    },
    {
      id: 'product-rp-compression-socks',
      sku: 'RP-ACC-CS-WHT-M',
      title: 'RunPro Pro Compression Socks',
      description: '20-30 mmHg graduated compression socks for running and recovery.',
      category: 'accessories',
      priceInr: 699,
      inventory: 60,
      warrantyMonths: 3,
      returnDays: 10,
      attributes: {
        compression_mmhg: '20-30',
        material: 'nylon-spandex',
        use_cases: ['running', 'recovery', 'travel'],
        sizes: ['S/M', 'L/XL'],
      },
    },
    {
      id: 'product-rp-hydration-vest',
      sku: 'RP-VEST-HV-5L-ORG',
      title: 'RunPro 5L Hydration Vest',
      description: 'Ultralight hydration vest with 2L bladder. Perfect for trail runs and ultras.',
      category: 'bags',
      priceInr: 2999,
      inventory: 12,
      warrantyMonths: 12,
      returnDays: 30,
      attributes: {
        capacity_litres: 5,
        bladder_capacity_litres: 2,
        waterproof: false,
        water_resistant: true,
        use_cases: ['trail-running', 'ultra-marathon', 'hiking'],
        weight_grams: 150,
      },
    },
    {
      id: 'product-rp-foam-roller',
      sku: 'RP-FIT-FR-36-BLK',
      title: 'RunPro Grid Foam Roller 36"',
      description: 'High-density foam roller for deep tissue massage and muscle recovery.',
      category: 'fitness',
      priceInr: 1499,
      inventory: 35,
      warrantyMonths: 12,
      returnDays: 15,
      attributes: {
        length_cm: 90,
        diameter_cm: 15,
        density: 'high',
        use_cases: ['recovery', 'physio', 'gym'],
      },
    },
    {
      id: 'product-rp-running-watch',
      sku: 'RP-TECH-RW-BLK',
      title: 'RunPro Pace GPS Watch',
      description: 'GPS running watch with heart rate monitor, pace alerts, and 40hr battery.',
      category: 'electronics',
      priceInr: 4999,
      inventory: 8,
      warrantyMonths: 24,
      returnDays: 30,
      attributes: {
        gps: true,
        heart_rate_monitor: true,
        battery_hours: 40,
        waterproof: true,
        use_cases: ['running', 'triathlon', 'fitness-tracking'],
      },
    },
    {
      id: 'product-rp-resistance-bands',
      sku: 'RP-FIT-RB-SET5',
      title: 'RunPro Resistance Band Set (5 Levels)',
      description: 'Premium latex resistance bands in 5 resistance levels. Includes carry bag.',
      category: 'fitness',
      priceInr: 899,
      inventory: 80,
      warrantyMonths: 6,
      returnDays: 15,
      attributes: {
        resistance_levels: 5,
        material: 'latex',
        use_cases: ['gym', 'home-workout', 'physio', 'training'],
      },
    },
    {
      id: 'product-rp-running-belt',
      sku: 'RP-ACC-RB-BLK',
      title: 'RunPro Flip Belt',
      description: 'Low-profile running belt with multiple pockets for phone, keys, and gels.',
      category: 'accessories',
      priceInr: 799,
      inventory: 30,
      warrantyMonths: 6,
      returnDays: 10,
      attributes: {
        phone_fit: 'up to 6.5 inch',
        pockets: 4,
        material: 'spandex',
        use_cases: ['running', 'gym', 'cycling'],
        sizes: ['XS', 'S', 'M', 'L', 'XL'],
      },
    },
    {
      id: 'product-rp-gym-bag',
      sku: 'RP-BAG-GYM-45L-BLK',
      title: 'RunPro 45L Gym Duffel Bag',
      description: 'Spacious gym duffel with wet/dry compartment and shoe tunnel. Water resistant exterior.',
      category: 'bags',
      priceInr: 2499,
      inventory: 22,
      warrantyMonths: 12,
      returnDays: 30,
      attributes: {
        capacity_litres: 45,
        water_resistant: true,
        waterproof: false,
        wet_dry_compartment: true,
        shoe_compartment: true,
        use_cases: ['gym', 'travel', 'sport'],
        material: 'polyester',
      },
    },
  ];

  for (const p of runProProducts) {
    await prisma.product.upsert({
      where: { id: p.id },
      update: {},
      create: { ...p, merchantId: runPro.id, images: [] } as any,
    });
  }

  // ─── TECHNEST PRODUCTS ───────────────────────────────────────────────────────

  const techNestProducts = [
    {
      id: 'product-tn-macbook-pro-m4',
      sku: 'TN-LAPTOP-MBP-M4-14',
      title: 'Apple MacBook Pro M4 14" (16GB/512GB)',
      description: 'The most powerful MacBook Pro ever. M4 chip with 16GB unified memory and 512GB SSD. Studio-quality display.',
      category: 'electronics',
      priceInr: 149900,
      inventory: 5,
      warrantyMonths: 12,
      returnDays: 7,
      attributes: {
        brand: 'apple',
        model: 'MacBook Pro M4',
        display_inches: 14.2,
        ram_gb: 16,
        storage_gb: 512,
        processor: 'Apple M4',
        battery_hours: 24,
        weight_grams: 1600,
        use_cases: ['professional', 'creative', 'development'],
      },
    },
    {
      id: 'product-tn-dell-xps-15',
      sku: 'TN-LAPTOP-DXPS15-I9',
      title: 'Dell XPS 15 (i9/32GB/1TB)',
      description: 'Premium Windows laptop with InfinityEdge display. Intel Core i9, 32GB RAM, 1TB SSD.',
      category: 'electronics',
      priceInr: 129900,
      inventory: 4,
      warrantyMonths: 12,
      returnDays: 7,
      attributes: {
        brand: 'dell',
        display_inches: 15.6,
        ram_gb: 32,
        storage_gb: 1000,
        processor: 'Intel Core i9',
        battery_hours: 13,
        weight_grams: 1860,
        use_cases: ['professional', 'development', 'content-creation'],
      },
    },
    {
      id: 'product-tn-sony-wh1000xm5',
      sku: 'TN-AUDIO-SNYWH5-BLK',
      title: 'Sony WH-1000XM5 Wireless Headphones',
      description: 'Industry-leading noise cancellation. 30-hour battery. Premium build with ultra-soft cushions.',
      category: 'electronics',
      priceInr: 24990,
      inventory: 15,
      warrantyMonths: 12,
      returnDays: 15,
      attributes: {
        brand: 'sony',
        driver_mm: 30,
        noise_cancelling: true,
        wireless: true,
        battery_hours: 30,
        weight_grams: 250,
        use_cases: ['travel', 'office', 'music', 'calls'],
      },
    },
    {
      id: 'product-tn-ipad-air-m2',
      sku: 'TN-TAB-IPAD-AIR-M2-11',
      title: 'Apple iPad Air M2 11" (256GB)',
      description: 'Versatile tablet powered by M2 chip. Brilliant Liquid Retina display. Supports Apple Pencil.',
      category: 'electronics',
      priceInr: 74900,
      inventory: 8,
      warrantyMonths: 12,
      returnDays: 7,
      attributes: {
        brand: 'apple',
        display_inches: 11,
        storage_gb: 256,
        processor: 'Apple M2',
        battery_hours: 10,
        weight_grams: 462,
        apple_pencil_support: true,
        use_cases: ['productivity', 'art', 'reading', 'entertainment'],
      },
    },
    {
      id: 'product-tn-anker-charger-65w',
      sku: 'TN-ACC-ANK-65W-BLK',
      title: 'Anker 65W USB-C GaN Charger',
      description: 'Compact GaN charger with 3 ports (2x USB-C, 1x USB-A). Charges laptop, phone, and tablet simultaneously.',
      category: 'electronics',
      priceInr: 2999,
      inventory: 50,
      warrantyMonths: 18,
      returnDays: 30,
      attributes: {
        brand: 'anker',
        wattage: 65,
        ports: 3,
        technology: 'GaN',
        use_cases: ['travel', 'office', 'laptop-charging'],
        weight_grams: 85,
      },
    },
    {
      id: 'product-tn-samsung-t7-ssd',
      sku: 'TN-STORAGE-T7-1TB-BLU',
      title: 'Samsung T7 1TB Portable SSD',
      description: 'Blazing fast 1TB portable SSD. 1,050 MB/s read. Password protection. Works with PC, Mac, iPhone.',
      category: 'electronics',
      priceInr: 7999,
      inventory: 20,
      warrantyMonths: 36,
      returnDays: 30,
      attributes: {
        brand: 'samsung',
        storage_gb: 1000,
        read_speed_mbps: 1050,
        write_speed_mbps: 1000,
        interface: 'USB 3.2 Gen2',
        weight_grams: 58,
        password_protection: true,
        use_cases: ['backup', 'storage', 'photography', 'video-editing'],
      },
    },
    {
      id: 'product-tn-logitech-mx-master3',
      sku: 'TN-PERIPH-LOGI-MXM3-GRY',
      title: 'Logitech MX Master 3S Wireless Mouse',
      description: 'Advanced wireless mouse with MagSpeed electromagnetic scrolling. 8K DPI. Works on any surface.',
      category: 'electronics',
      priceInr: 7995,
      inventory: 18,
      warrantyMonths: 24,
      returnDays: 15,
      attributes: {
        brand: 'logitech',
        dpi: 8000,
        wireless: true,
        battery_hours: 70,
        weight_grams: 141,
        use_cases: ['office', 'development', 'design'],
        os_compatibility: ['Windows', 'macOS', 'Linux'],
      },
    },
    {
      id: 'product-tn-keychron-k2-pro',
      sku: 'TN-PERIPH-KEY-K2P-BLK',
      title: 'Keychron K2 Pro Wireless Mechanical Keyboard',
      description: 'Compact 75% wireless mechanical keyboard. Hot-swappable switches. RGB backlight. Works on Mac and Windows.',
      category: 'electronics',
      priceInr: 8499,
      inventory: 10,
      warrantyMonths: 12,
      returnDays: 15,
      attributes: {
        brand: 'keychron',
        layout: '75%',
        wireless: true,
        hot_swappable: true,
        rgb_backlight: true,
        switch_type: 'mechanical',
        battery_mah: 4000,
        weight_grams: 765,
        os_compatibility: ['Windows', 'macOS'],
      },
    },
    {
      id: 'product-tn-dell-27-monitor',
      sku: 'TN-DISP-DELL-U27-4K',
      title: 'Dell UltraSharp 27" 4K USB-C Monitor',
      description: 'Professional 27" 4K IPS monitor with 90W USB-C charging. Color-accurate for creative professionals.',
      category: 'electronics',
      priceInr: 34990,
      inventory: 7,
      warrantyMonths: 36,
      returnDays: 15,
      attributes: {
        brand: 'dell',
        display_inches: 27,
        resolution: '4K',
        panel_type: 'IPS',
        usb_c_charging_watts: 90,
        color_accuracy: 'sRGB 99%',
        use_cases: ['professional', 'creative', 'development'],
      },
    },
    {
      id: 'product-tn-webcam-logitech-4k',
      sku: 'TN-PERIPH-LOGI-BRIO-BLK',
      title: 'Logitech BRIO 4K Webcam',
      description: '4K Ultra HD webcam with HDR and Windows Hello support. Auto-adjustment for any lighting condition.',
      category: 'electronics',
      priceInr: 12999,
      inventory: 14,
      warrantyMonths: 24,
      returnDays: 15,
      attributes: {
        brand: 'logitech',
        resolution: '4K',
        fps: 60,
        hdr: true,
        windows_hello: true,
        use_cases: ['video-calls', 'streaming', 'recording'],
      },
    },
    {
      id: 'product-tn-iphone-15-pro',
      sku: 'TN-PHONE-IP15P-BLK-128',
      title: 'Apple iPhone 15 Pro (128GB)',
      description: 'Titanium design. A17 Pro chip. 48MP camera system. USB-C connector.',
      category: 'electronics',
      priceInr: 134900,
      inventory: 10,
      warrantyMonths: 12,
      returnDays: 7,
      attributes: {
        brand: 'apple',
        storage_gb: 128,
        processor: 'A17 Pro',
        camera_mp: 48,
        battery_hours: 23,
        weight_grams: 187,
        use_cases: ['communication', 'photography', 'productivity'],
      },
    },
    {
      id: 'product-tn-airpods-pro2',
      sku: 'TN-AUDIO-APP2-WHT',
      title: 'Apple AirPods Pro (2nd Gen)',
      description: 'Active Noise Cancellation, Transparency mode, Personalised Spatial Audio. H2 chip.',
      category: 'electronics',
      priceInr: 24900,
      inventory: 18,
      warrantyMonths: 12,
      returnDays: 15,
      attributes: {
        brand: 'apple',
        noise_cancelling: true,
        wireless: true,
        battery_hours: 6,
        case_battery_hours: 30,
        spatial_audio: true,
        use_cases: ['music', 'calls', 'fitness'],
      },
    },
    {
      id: 'product-tn-cable-management-kit',
      sku: 'TN-ACC-CMK-BLK',
      title: 'TechNest Cable Management Kit (15pc)',
      description: 'Complete cable management system with velcro ties, clips, and cable boxes.',
      category: 'accessories',
      priceInr: 599,
      inventory: 100,
      warrantyMonths: 6,
      returnDays: 15,
      attributes: {
        piece_count: 15,
        material: 'plastic-velcro',
        use_cases: ['office', 'home', 'desk-setup'],
      },
    },
    {
      id: 'product-tn-laptop-stand',
      sku: 'TN-ACC-LS-ALU-SLV',
      title: 'TechNest Aluminium Laptop Stand',
      description: 'Adjustable aluminium laptop stand compatible with 11"-17" laptops. Foldable for travel.',
      category: 'accessories',
      priceInr: 1999,
      inventory: 35,
      warrantyMonths: 12,
      returnDays: 30,
      attributes: {
        material: 'aluminium',
        laptop_size_max_inches: 17,
        adjustable: true,
        foldable: true,
        weight_grams: 420,
        use_cases: ['office', 'home', 'travel'],
      },
    },
    {
      id: 'product-tn-phone-charger-30w',
      sku: 'TN-ACC-CHG-30W-WHT',
      title: 'TechNest 30W GaN Phone Charger',
      description: 'Compact 30W GaN charger compatible with all phones. Charges iPhone and Android at full speed.',
      category: 'electronics',
      priceInr: 999,
      inventory: 80,
      warrantyMonths: 12,
      returnDays: 30,
      attributes: {
        wattage: 30,
        technology: 'GaN',
        compatibility: ['iPhone', 'Android', 'iPad'],
        weight_grams: 45,
        use_cases: ['travel', 'office', 'home'],
      },
    },
    {
      id: 'product-tn-smart-plug',
      sku: 'TN-IOT-SP-WHT-4PK',
      title: 'TechNest Smart WiFi Plug (Pack of 4)',
      description: 'Smart plugs with energy monitoring, schedules, and voice control (Alexa/Google).',
      category: 'electronics',
      priceInr: 1999,
      inventory: 40,
      warrantyMonths: 12,
      returnDays: 15,
      attributes: {
        pack_count: 4,
        wifi_standard: '2.4GHz',
        voice_control: ['Alexa', 'Google Home'],
        energy_monitoring: true,
        use_cases: ['smart-home', 'automation', 'energy-saving'],
      },
    },
    {
      id: 'product-tn-portable-charger-20k',
      sku: 'TN-ACC-PB-20K-BLK',
      title: 'TechNest 20000mAh Portable Charger',
      description: '20000mAh power bank with 22.5W fast charging, 2 USB-A + 1 USB-C ports. LED indicator.',
      category: 'electronics',
      priceInr: 1799,
      inventory: 45,
      warrantyMonths: 12,
      returnDays: 30,
      attributes: {
        capacity_mah: 20000,
        fast_charging_watts: 22.5,
        ports: 3,
        weight_grams: 375,
        use_cases: ['travel', 'camping', 'emergency'],
      },
    },
    {
      id: 'product-tn-screen-protector-iphone15',
      sku: 'TN-ACC-SP-IP15P-CLR',
      title: 'TechNest Screen Protector iPhone 15 Pro (3-Pack)',
      description: 'Premium tempered glass screen protectors for iPhone 15 Pro. Fingerprint resistant, case-friendly.',
      category: 'accessories',
      priceInr: 399,
      inventory: 150,
      warrantyMonths: 3,
      returnDays: 7,
      attributes: {
        compatibility: 'iPhone 15 Pro',
        material: 'tempered-glass',
        pack_count: 3,
        fingerprint_resistant: true,
        use_cases: ['screen-protection'],
      },
    },
  ];

  for (const p of techNestProducts) {
    await prisma.product.upsert({
      where: { id: p.id },
      update: {},
      create: { ...p, merchantId: techNest.id, images: [] } as any,
    });
  }

  // More UrbanTrail backpacks (to reach 60+ products)
  const moreUrbanTrail = [
    {
      id: 'product-ut-tote-canvas',
      sku: 'UT-TOT-CNV-14L-TAN',
      title: 'UrbanTrail Canvas Tote 14L',
      description: 'Handcrafted waxed canvas tote. Doubles as a laptop bag for 13" devices.',
      category: 'bags',
      priceInr: 1499,
      inventory: 20,
      warrantyMonths: 6,
      returnDays: 15,
      attributes: { capacity_litres: 14, material: 'waxed-canvas', laptop_size_inches: 13, use_cases: ['office', 'commute'] },
    },
    {
      id: 'product-ut-sling-bag',
      sku: 'UT-SLG-5L-BLK',
      title: 'UrbanTrail Mini Sling Bag 5L',
      description: 'Compact crossbody sling for essentials. Water resistant.',
      category: 'bags',
      priceInr: 899,
      inventory: 30,
      warrantyMonths: 6,
      returnDays: 10,
      attributes: { capacity_litres: 5, water_resistant: true, material: 'polyester', use_cases: ['commute', 'city', 'cycling'] },
    },
    {
      id: 'product-ut-duffel-40l',
      sku: 'UT-DFL-40L-NVY',
      title: 'UrbanTrail Weekend Duffel 40L',
      description: 'Perfect weekend travel bag. Converts to backpack. Waterproof base.',
      category: 'bags',
      priceInr: 2799,
      inventory: 14,
      warrantyMonths: 12,
      returnDays: 30,
      attributes: { capacity_litres: 40, waterproof: false, water_resistant: true, backpack_straps: true, use_cases: ['weekend-travel', 'gym', 'sport'] },
    },
    {
      id: 'product-ut-tech-organizer',
      sku: 'UT-ORG-TECH-BLK',
      title: 'UrbanTrail Tech Organizer Pouch',
      description: 'Cable and tech organizer for travel. Fits chargers, cables, earphones, passport.',
      category: 'accessories',
      priceInr: 699,
      inventory: 60,
      warrantyMonths: 6,
      returnDays: 10,
      attributes: { material: 'polyester', use_cases: ['travel', 'organization', 'tech'] },
    },
    {
      id: 'product-ut-rain-cover',
      sku: 'UT-RC-35-50L-GRN',
      title: 'UrbanTrail Universal Rain Cover (35-50L)',
      description: 'Emergency rain cover for backpacks. Fits 35-50L bags. Stored in integrated pocket.',
      category: 'accessories',
      priceInr: 349,
      inventory: 80,
      warrantyMonths: 3,
      returnDays: 7,
      attributes: { fits_litres: '35-50', material: 'polyester', use_cases: ['rain-protection', 'travel'] },
    },
  ];

  for (const p of moreUrbanTrail) {
    await prisma.product.upsert({
      where: { id: p.id },
      update: {},
      create: { ...p, merchantId: urbanTrail.id, images: [] } as any,
    });
  }

  const moreRunPro = [
    {
      id: 'product-rp-yoga-mat',
      sku: 'RP-FIT-YM-6MM-PUR',
      title: 'RunPro Premium Yoga Mat 6mm',
      description: 'Non-slip yoga mat with alignment lines. 6mm cushioning for joints.',
      category: 'fitness',
      priceInr: 1199,
      inventory: 25,
      warrantyMonths: 6,
      returnDays: 15,
      attributes: { thickness_mm: 6, material: 'TPE', non_slip: true, use_cases: ['yoga', 'pilates', 'stretching'] },
    },
    {
      id: 'product-rp-jump-rope',
      sku: 'RP-FIT-JR-BLK',
      title: 'RunPro Speed Jump Rope',
      description: 'Ball-bearing jump rope for speed training. Adjustable length. Lightweight handles.',
      category: 'fitness',
      priceInr: 499,
      inventory: 60,
      warrantyMonths: 6,
      returnDays: 10,
      attributes: { adjustable: true, material: 'steel-cable', use_cases: ['cardio', 'training', 'boxing'] },
    },
    {
      id: 'product-rp-nutrition-shaker',
      sku: 'RP-ACC-NS-700ML-BLK',
      title: 'RunPro Protein Shaker 700ml',
      description: 'Leak-proof protein shaker with stainless steel ball. BPA-free.',
      category: 'accessories',
      priceInr: 399,
      inventory: 90,
      warrantyMonths: 6,
      returnDays: 10,
      attributes: { capacity_ml: 700, bpa_free: true, leak_proof: true, use_cases: ['gym', 'nutrition'] },
    },
    {
      id: 'product-rp-sports-sunglasses',
      sku: 'RP-ACC-SG-POL-BLK',
      title: 'RunPro Polarized Sports Sunglasses',
      description: 'Lightweight polarized sports sunglasses with UV400 protection. Anti-slip nose pads.',
      category: 'accessories',
      priceInr: 1499,
      inventory: 20,
      warrantyMonths: 12,
      returnDays: 15,
      attributes: { polarized: true, uv_protection: 'UV400', weight_grams: 28, use_cases: ['running', 'cycling', 'outdoor'] },
    },
    {
      id: 'product-rp-ankle-support',
      sku: 'RP-ACC-AS-M-BLK',
      title: 'RunPro Ankle Support Brace',
      description: 'Compression ankle brace for running and sports. Figure-8 strap for targeted support.',
      category: 'accessories',
      priceInr: 649,
      inventory: 35,
      warrantyMonths: 3,
      returnDays: 10,
      attributes: { material: 'neoprene', sizes: ['S', 'M', 'L', 'XL'], use_cases: ['running', 'sports', 'recovery'] },
    },
    {
      id: 'product-rp-trail-shorts',
      sku: 'RP-APP-TS-6IN-M-GRN',
      title: 'RunPro 6" Trail Shorts',
      description: 'Trail running shorts with deep pockets for phone and gels. Quick-dry fabric.',
      category: 'apparel',
      priceInr: 1599,
      inventory: 30,
      warrantyMonths: 3,
      returnDays: 15,
      attributes: { inseam_inches: 6, pocket_depth: 'deep', material: 'quick-dry-polyester', use_cases: ['trail-running', 'hiking'] },
    },
    {
      id: 'product-rp-running-cap',
      sku: 'RP-APP-CAP-BLK',
      title: 'RunPro Running Cap',
      description: 'Lightweight running cap with UPF 50+ sun protection and sweat-wicking band.',
      category: 'apparel',
      priceInr: 799,
      inventory: 45,
      warrantyMonths: 3,
      returnDays: 10,
      attributes: { material: 'polyester', upf: 50, sweat_wicking: true, use_cases: ['running', 'outdoor'] },
    },
    {
      id: 'product-rp-track-pants',
      sku: 'RP-APP-TP-M-NVY',
      title: 'RunPro Track Pants',
      description: 'Tapered track pants with zip ankles and side pockets. Warm but breathable.',
      category: 'apparel',
      priceInr: 1799,
      inventory: 20,
      warrantyMonths: 3,
      returnDays: 15,
      attributes: { material: 'polyester-tricot', zip_ankles: true, use_cases: ['gym', 'running', 'casual'] },
    },
    {
      id: 'product-rp-long-sleeve-tee',
      sku: 'RP-APP-LST-M-BLU',
      title: 'RunPro DriFit Long Sleeve Tee',
      description: 'Moisture-wicking long sleeve running shirt with reflective details for low-light visibility.',
      category: 'apparel',
      priceInr: 999,
      inventory: 30,
      warrantyMonths: 3,
      returnDays: 15,
      attributes: { material: 'polyester', reflective: true, moisture_wicking: true, use_cases: ['running', 'gym'] },
    },
    {
      id: 'product-rp-casual-runner',
      sku: 'RP-SHOE-CR-WHT-10',
      title: 'RunPro Casual Runner',
      description: 'Everyday casual sneaker with running-inspired cushioning. Versatile style for gym to street.',
      category: 'footwear',
      priceInr: 2999,
      inventory: 25,
      warrantyMonths: 6,
      returnDays: 30,
      attributes: { use_cases: ['casual', 'gym', 'walking'], weight_grams: 280, sole_material: 'rubber' },
    },
  ];

  for (const p of moreRunPro) {
    await prisma.product.upsert({
      where: { id: p.id },
      update: {},
      create: { ...p, merchantId: runPro.id, images: [] } as any,
    });
  }

  // Count products
  const productCount = await prisma.product.count();
  const merchantCount = await prisma.merchant.count();
  console.log(`✅ Seeded ${merchantCount} merchants and ${productCount} products`);

  // ─── INITIAL CATALOG ISSUES for UrbanTrail (for Merchant Agent demo) ────────

  await prisma.catalogIssue.deleteMany({ where: { merchantId: urbanTrail.id } });

  const catalogIssues = [
    {
      merchantId: urbanTrail.id,
      productId: 'product-travelpro-rainshield-30l',
      severity: 'HIGH',
      type: 'AMBIGUOUS_DELIVERY_SLA',
      title: 'Delivery SLA is not machine-readable',
      evidence: 'Delivery stored as nested attribute override, not as a standard MerchantPolicy record',
      problem:
        'An AI buyer cannot reliably determine whether TravelPro RainShield reaches a destination within a deadline because the delivery data is in a non-standard location.',
      proposedFix: {
        type: 'CREATE_DELIVERY_POLICY',
        policies: [
          { key: 'bangalore_delivery', value: { minDays: 5, maxDays: 7, fee: 49, available: true } },
          { key: 'mumbai_delivery', value: { minDays: 4, maxDays: 6, fee: 49, available: true } },
        ],
      },
      impact: 'Delivery constraint checks will work correctly, reducing false negatives in AI buyer simulations.',
    },
    {
      merchantId: urbanTrail.id,
      severity: 'HIGH',
      type: 'MISSING_STRUCTURED_ATTRIBUTES',
      title: 'Several products missing key structured attributes',
      evidence: 'Products like Canvas Tote and Sling Bag lack waterproof boolean attribute',
      problem:
        'AI buyers querying for waterproof products cannot reliably filter these products because the waterproof attribute is missing.',
      proposedFix: {
        type: 'ADD_ATTRIBUTES',
        products: ['product-ut-tote-canvas', 'product-ut-sling-bag'],
        attributes: { waterproof: false },
      },
      impact: 'Reduces false positives and improves constraint match accuracy.',
    },
    {
      merchantId: urbanTrail.id,
      severity: 'MEDIUM',
      type: 'INCOMPLETE_AI_METADATA',
      title: 'AI metadata searchTerms array is thin for several products',
      evidence: 'TravelPro RainShield has only 5 search terms vs UrbanTrail 35L with 9',
      problem:
        'Sparse searchTerms reduce product discovery for long-tail buyer queries that don\'t match exact product names.',
      proposedFix: {
        type: 'EXPAND_AI_METADATA',
        productId: 'product-travelpro-rainshield-30l',
        additionalSearchTerms: ['budget waterproof bag', '30L travel bag', 'rain proof travel backpack', 'affordable laptop bag', 'economy shipping bag'],
      },
      impact: 'Estimated +12% improvement in discovery rate for budget-focused buyer queries.',
    },
    {
      merchantId: urbanTrail.id,
      severity: 'MEDIUM',
      type: 'MISSING_RETURN_POLICY',
      title: 'Rain Cover and Tech Organizer have short return windows',
      evidence: 'returnDays = 7-10 days for accessories vs 30 days for main backpacks',
      problem:
        'AI buyers with quality-conscious intents may be discouraged by short return windows on accessories.',
      proposedFix: {
        type: 'UPDATE_RETURN_POLICY',
        products: ['product-ut-rain-cover', 'product-ut-tech-organizer'],
        returnDays: 15,
      },
      impact: 'Higher checkout readiness for buyers who include return policy in their criteria.',
    },
    {
      merchantId: urbanTrail.id,
      severity: 'LOW',
      type: 'MISSING_IMAGES',
      title: 'Several products have no product images',
      evidence: '5 of 8 UrbanTrail products have images: [] (empty array)',
      problem:
        'Buyer-facing product cards cannot show product images, reducing trust and click-through.',
      proposedFix: { type: 'ADD_IMAGES', message: 'Upload product images to /images/products/ and update the images array.' },
      impact: 'Improved buyer experience and trust signals.',
    },
    {
      merchantId: urbanTrail.id,
      severity: 'LOW',
      type: 'AMBIGUOUS_DESCRIPTION',
      title: 'TrekMax Everyday description does not distinguish from waterproof',
      evidence: '"water-resistant shell" may be confused with "waterproof" by buyers',
      problem:
        'Buyers seeking waterproof products may click on TrekMax expecting full waterproofing and be disappointed.',
      proposedFix: {
        type: 'UPDATE_DESCRIPTION',
        productId: 'product-trekmax-everyday-32l',
        addText: ' Note: This bag is water-resistant, not waterproof. It can handle light rain but not heavy downpour or submersion.',
      },
      impact: 'Reduces returns from mismatched expectations and improves buyer satisfaction.',
    },
  ];

  for (const issue of catalogIssues) {
    await prisma.catalogIssue.create({ data: issue as any });
  }

  const issueCount = await prisma.catalogIssue.count();
  console.log(`✅ Seeded ${issueCount} catalog issues`);
  console.log('🎉 Seed complete!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
