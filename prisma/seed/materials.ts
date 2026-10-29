import { PrismaClient } from '@prisma/client';
import { BRANCHES, TENANT_ID } from './catalog';
import { id } from './ids';

export interface MaterialSeedItem {
  code: string;
  name: string;
  amharicName?: string;
  category: 'CUTLERY' | 'CROCKERY' | 'GLASSWARE' | 'TRAYS' | 'WARMERS_CARRIERS' | 'CONTAINERS' | 'OTHER';
  unit: string;
  isReusable: boolean;
  imageUrl?: string;
  description?: string;
  sortOrder: number;
  initialOnHand: number;
}

export const SEED_MATERIALS: MaterialSeedItem[] = [
  // ─── CUTLERY (20 items) ───────────────────────────────────────────
  { code: 'MAT-CUT-001', name: 'Standard Dinner Fork', amharicName: 'የራት ሹካ', category: 'CUTLERY', unit: 'pcs', isReusable: true, imageUrl: '/images/materials/fork.jpg', description: 'Stainless steel 18/10 table dinner fork for main courses.', sortOrder: 1, initialOnHand: 150 },
  { code: 'MAT-CUT-002', name: 'Standard Table Knife', amharicName: 'የራት ቢላ / ካራ', category: 'CUTLERY', unit: 'pcs', isReusable: true, imageUrl: '/images/materials/knife.jpg', description: 'Serrated stainless table dinner knife.', sortOrder: 2, initialOnHand: 150 },
  { code: 'MAT-CUT-003', name: 'Standard Soup Spoon', amharicName: 'የሾርባ ማንኪያ', category: 'CUTLERY', unit: 'pcs', isReusable: true, imageUrl: '/images/materials/spoon.jpg', description: 'Deep oval bowl soup spoon.', sortOrder: 3, initialOnHand: 150 },
  { code: 'MAT-CUT-004', name: 'Teaspoon / Coffee Spoon', amharicName: 'የሻይ ማንኪያ', category: 'CUTLERY', unit: 'pcs', isReusable: true, imageUrl: '/images/materials/teaspoon.jpg', description: 'Small stainless spoon for hot drinks and desserts.', sortOrder: 4, initialOnHand: 200 },
  { code: 'MAT-CUT-005', name: 'Dessert Fork', amharicName: 'የጣፋጭ ሹካ', category: 'CUTLERY', unit: 'pcs', isReusable: true, imageUrl: '/images/materials/fork.jpg', description: '3-prong fork for pastries and cakes.', sortOrder: 5, initialOnHand: 120 },
  { code: 'MAT-CUT-006', name: 'Steak Knife (Wood Handle)', amharicName: 'የስቴክ ቢላ', category: 'CUTLERY', unit: 'pcs', isReusable: true, imageUrl: '/images/materials/knife.jpg', description: 'Heavy-duty sharp serrated steak knife.', sortOrder: 6, initialOnHand: 80 },
  { code: 'MAT-CUT-007', name: 'Butter Spreader Knife', amharicName: 'የቅቤ ቢላ', category: 'CUTLERY', unit: 'pcs', isReusable: true, imageUrl: '/images/materials/knife.jpg', description: 'Rounded dull-edge butter knife.', sortOrder: 7, initialOnHand: 60 },
  { code: 'MAT-CUT-008', name: 'Fish Knife', amharicName: 'የአሳ ቢላ', category: 'CUTLERY', unit: 'pcs', isReusable: true, imageUrl: '/images/materials/knife.jpg', description: 'Wide blade fish knife for delicate fillets.', sortOrder: 8, initialOnHand: 50 },
  { code: 'MAT-CUT-009', name: 'Fish Fork', amharicName: 'የአሳ ሹካ', category: 'CUTLERY', unit: 'pcs', isReusable: true, imageUrl: '/images/materials/fork.jpg', description: '4-tine fish fork with notch.', sortOrder: 9, initialOnHand: 50 },
  { code: 'MAT-CUT-010', name: 'Salad Fork', amharicName: 'የሰላጣ ሹካ', category: 'CUTLERY', unit: 'pcs', isReusable: true, imageUrl: '/images/materials/fork.jpg', description: 'Broad fork for starters and salads.', sortOrder: 10, initialOnHand: 100 },
  { code: 'MAT-CUT-011', name: 'Reusable Bamboo Chopsticks (Pair)', amharicName: 'ቾፕስቲክስ', category: 'CUTLERY', unit: 'pair', isReusable: true, imageUrl: '/images/materials/chopsticks.jpg', description: 'Washable hardwood reusable chopsticks pair.', sortOrder: 11, initialOnHand: 100 },
  { code: 'MAT-CUT-012', name: 'Stainless Serving Spoon (Large)', amharicName: 'ትልቅ ማቅረቢያ ማንኪያ', category: 'CUTLERY', unit: 'pcs', isReusable: true, imageUrl: '/images/materials/spoon.jpg', description: 'Heavy banquet serving spoon 25cm.', sortOrder: 12, initialOnHand: 40 },
  { code: 'MAT-CUT-013', name: 'Stainless Serving Fork (Large)', amharicName: 'ትልቅ ማቅረቢያ ሹካ', category: 'CUTLERY', unit: 'pcs', isReusable: true, imageUrl: '/images/materials/fork.jpg', description: 'Heavy banquet serving fork 25cm.', sortOrder: 13, initialOnHand: 40 },
  { code: 'MAT-CUT-014', name: 'Buffet Salad Tongs', amharicName: 'የሰላጣ መቆንጠጫ', category: 'CUTLERY', unit: 'pcs', isReusable: true, imageUrl: '/images/materials/cutlery-set.jpg', description: 'Stainless scissor-style tongs for salads and pasta.', sortOrder: 14, initialOnHand: 30 },
  { code: 'MAT-CUT-015', name: 'Pastry / Bread Tongs', amharicName: 'የዳቦ መቆንጠጫ', category: 'CUTLERY', unit: 'pcs', isReusable: true, imageUrl: '/images/materials/cutlery-set.jpg', description: 'Flat-paddle tongs for baked goods and injera pieces.', sortOrder: 15, initialOnHand: 35 },
  { code: 'MAT-CUT-016', name: 'Deep Soup Ladle (Stainless)', amharicName: 'የሾርባ ጭልፋ', category: 'CUTLERY', unit: 'pcs', isReusable: true, imageUrl: '/images/materials/spoon.jpg', description: 'Deep round ladle 150ml capacity.', sortOrder: 16, initialOnHand: 25 },
  { code: 'MAT-CUT-017', name: 'Gravy / Sauce Ladle', amharicName: 'የመረቅ ጭልፋ', category: 'CUTLERY', unit: 'pcs', isReusable: true, imageUrl: '/images/materials/spoon.jpg', description: 'Small hooked side-pour gravy ladle 60ml.', sortOrder: 17, initialOnHand: 30 },
  { code: 'MAT-CUT-018', name: 'Pie & Cake Server', amharicName: 'የኬክ መቁረጫ', category: 'CUTLERY', unit: 'pcs', isReusable: true, imageUrl: '/images/materials/knife.jpg', description: 'Triangular serrated edge pastry server.', sortOrder: 18, initialOnHand: 20 },
  { code: 'MAT-CUT-019', name: 'Complete 3-Piece Cutlery Set (Pouch)', amharicName: 'የተሟላ ሹካ፣ ቢላና ማንኪያ', category: 'CUTLERY', unit: 'set', isReusable: true, imageUrl: '/images/materials/cutlery-set.jpg', description: 'Fork, knife, spoon in linen delivery pouch.', sortOrder: 19, initialOnHand: 80 },
  { code: 'MAT-CUT-020', name: 'Cocktail / Sundae Spoon (Long)', amharicName: 'ረጅም የማኪያቶ ማንኪያ', category: 'CUTLERY', unit: 'pcs', isReusable: true, imageUrl: '/images/materials/spoon.jpg', description: 'Long handle 20cm spoon for tall drinks & sundaes.', sortOrder: 20, initialOnHand: 60 },

  // ─── CROCKERY / PLATES & BOWLS (25 items) ──────────────────────────
  { code: 'MAT-CRK-001', name: 'Porcelain Dinner Plate 10.5"', amharicName: 'ትልቅ የራት ሳህን', category: 'CROCKERY', unit: 'pcs', isReusable: true, imageUrl: '/images/materials/dinner-plate.jpg', description: 'Commercial rolled-edge white porcelain main plate.', sortOrder: 21, initialOnHand: 180 },
  { code: 'MAT-CRK-002', name: 'Porcelain Side / Bread Plate 6.5"', amharicName: 'ትንሽ የዳቦ ሳህን', category: 'CROCKERY', unit: 'pcs', isReusable: true, imageUrl: '/images/materials/side-plate.jpg', description: 'Appetizer, dessert, and side bread plate.', sortOrder: 22, initialOnHand: 180 },
  { code: 'MAT-CRK-003', name: 'Wide Rim Pasta / Risotto Bowl 11"', amharicName: 'የፓስታ ሳህን', category: 'CROCKERY', unit: 'pcs', isReusable: true, imageUrl: '/images/materials/pasta-bowl.jpg', description: 'Deep well pasta bowl with wide presentation rim.', sortOrder: 23, initialOnHand: 90 },
  { code: 'MAT-CRK-004', name: 'Deep Soup / Noodle Bowl 7"', amharicName: 'የሾርባ ጎድጓዳ ሳህን', category: 'CROCKERY', unit: 'pcs', isReusable: true, imageUrl: '/images/materials/soup-bowl.jpg', description: 'High-sided bowl for soups, broths, and shiro.', sortOrder: 24, initialOnHand: 110 },
  { code: 'MAT-CRK-005', name: 'Salad / Starter Bowl 6"', amharicName: 'የሰላጣ ሳህን', category: 'CROCKERY', unit: 'pcs', isReusable: true, imageUrl: '/images/materials/salad-bowl.jpg', description: 'Flared rim starter bowl for fresh salads.', sortOrder: 25, initialOnHand: 85 },
  { code: 'MAT-CRK-006', name: 'Oval Ceramic Fish Platter 12"', amharicName: 'ኦቫል የአሳ ሳህን', category: 'CROCKERY', unit: 'pcs', isReusable: true, imageUrl: '/images/materials/oval-platter.jpg', description: 'Oval presentation dish for whole fish or mixed meats.', sortOrder: 26, initialOnHand: 40 },
  { code: 'MAT-CRK-007', name: 'Oval Banquet Platter 14"', amharicName: 'ትልቅ ኦቫል ሳህን', category: 'CROCKERY', unit: 'pcs', isReusable: true, imageUrl: '/images/materials/oval-tray.jpg', description: 'Large oval sharing platter for family orders.', sortOrder: 27, initialOnHand: 35 },
  { code: 'MAT-CRK-008', name: 'Charger Presentation Plate 12"', amharicName: 'የስነ-ስርዓት ሳህን', category: 'CROCKERY', unit: 'pcs', isReusable: true, imageUrl: '/images/materials/dinner-plate.jpg', description: 'Gold rim base charger plate for VIP banquet tables.', sortOrder: 28, initialOnHand: 60 },
  { code: 'MAT-CRK-009', name: 'Ceramic Ramekin 3.5oz', amharicName: 'ትንሽ የሶስ ሰሃን', category: 'CROCKERY', unit: 'pcs', isReusable: true, imageUrl: '/images/materials/ramekin.jpg', description: 'Ribbed white ramekin for awaze, mitmita, dips.', sortOrder: 29, initialOnHand: 160 },
  { code: 'MAT-CRK-010', name: 'Ceramic Ramekin 5oz', amharicName: 'መካከለኛ የሶስ ሰሃን', category: 'CROCKERY', unit: 'pcs', isReusable: true, imageUrl: '/images/materials/ramekin.jpg', description: 'Single-portion ramekin for baked sides.', sortOrder: 30, initialOnHand: 100 },
  { code: 'MAT-CRK-011', name: 'Porcelain Coffee Cup & Saucer Set', amharicName: 'የቡና ሲኒ ከስኒ መደገፊያ ጋር', category: 'CROCKERY', unit: 'set', isReusable: true, imageUrl: '/images/materials/coffee-cup.jpg', description: 'Classic 180ml coffee cup with matching saucer.', sortOrder: 31, initialOnHand: 120 },
  { code: 'MAT-CRK-012', name: 'Traditional Ethiopian Sini Cup (No Handle)', amharicName: 'የባህል ሲኒ', category: 'CROCKERY', unit: 'pcs', isReusable: true, imageUrl: '/images/materials/coffee-cup.jpg', description: 'Traditional ceramic coffee sini for jebena ceremonies.', sortOrder: 32, initialOnHand: 150 },
  { code: 'MAT-CRK-013', name: 'Cappuccino / Latte Mug 300ml', amharicName: 'ትልቅ የቡና ኩባያ', category: 'CROCKERY', unit: 'pcs', isReusable: true, imageUrl: '/images/materials/mug.jpg', description: 'Heavy porcelain mug with thick thermal walls.', sortOrder: 33, initialOnHand: 90 },
  { code: 'MAT-CRK-014', name: 'Espresso Demitasse Cup & Saucer', amharicName: 'የኤክስፕሬሶ ሲኒ', category: 'CROCKERY', unit: 'set', isReusable: true, imageUrl: '/images/materials/espresso-cup.jpg', description: 'Small 60ml single shot espresso cup with saucer.', sortOrder: 34, initialOnHand: 80 },
  { code: 'MAT-CRK-015', name: 'Porcelain Teapot with Lid 600ml', amharicName: 'የሻይ ማፍያ ፖት', category: 'CROCKERY', unit: 'pcs', isReusable: true, imageUrl: '/images/materials/teapot.jpg', description: 'Table teapot with stainless mesh filter for loose tea.', sortOrder: 35, initialOnHand: 30 },
  { code: 'MAT-CRK-016', name: 'Milk / Creamer Pitcher 150ml', amharicName: 'የወተት ማስቀመጫ', category: 'CROCKERY', unit: 'pcs', isReusable: true, imageUrl: '/images/materials/creamer.jpg', description: 'Ceramic mini creamer jug with drip-free spout.', sortOrder: 36, initialOnHand: 45 },
  { code: 'MAT-CRK-017', name: 'Porcelain Sugar Pot with Lid', amharicName: 'የስኳር ማስቀመጫ', category: 'CROCKERY', unit: 'pcs', isReusable: true, imageUrl: '/images/materials/creamer.jpg', description: 'Sugar bowl with notch for spoon.', sortOrder: 37, initialOnHand: 40 },
  { code: 'MAT-CRK-018', name: 'Ceramic Gravy Boat 250ml', amharicName: 'የሶስ / መረቅ ማቅረቢያ', category: 'CROCKERY', unit: 'pcs', isReusable: true, imageUrl: '/images/materials/ramekin.jpg', description: 'Classic porcelain boat for jus, gravy, and sauces.', sortOrder: 38, initialOnHand: 25 },
  { code: 'MAT-CRK-019', name: 'Square Presentation Plate 9"', amharicName: 'ካሬ የዳቦ/ጣፋጭ ሳህን', category: 'CROCKERY', unit: 'pcs', isReusable: true, imageUrl: '/images/materials/square-plate.jpg', description: 'Contemporary square rim porcelain plate.', sortOrder: 39, initialOnHand: 50 },
  { code: 'MAT-CRK-020', name: 'Square Presentation Plate 11"', amharicName: 'ትልቅ ካሬ ሳህን', category: 'CROCKERY', unit: 'pcs', isReusable: true, imageUrl: '/images/materials/square-plate.jpg', description: 'Modern square main course plate.', sortOrder: 40, initialOnHand: 45 },
  { code: 'MAT-CRK-021', name: 'Divided Condiment Trio Dish', amharicName: 'ባለ ሶስት ክፍል ሰሃን', category: 'CROCKERY', unit: 'pcs', isReusable: true, imageUrl: '/images/materials/ramekin.jpg', description: '3-compartment dish for sauces, olives, and spices.', sortOrder: 41, initialOnHand: 40 },
  { code: 'MAT-CRK-022', name: 'Mini Butter Dish with Lid', amharicName: 'የቅቤ ሳህን', category: 'CROCKERY', unit: 'pcs', isReusable: true, imageUrl: '/images/materials/ramekin.jpg', description: 'Individual porcelain covered butter holder.', sortOrder: 42, initialOnHand: 35 },
  { code: 'MAT-CRK-023', name: 'Clay Shiro Pot (Traditional Desta)', amharicName: 'የሸክላ ድስት', category: 'CROCKERY', unit: 'pcs', isReusable: true, imageUrl: '/images/materials/clay-desta.jpg', description: 'Traditional unglazed earthenware pot for bubbling shiro.', sortOrder: 43, initialOnHand: 60 },
  { code: 'MAT-CRK-024', name: 'Dessert Coupe Dish (Glass/Ceramic)', amharicName: 'የአይስክሬም ኩባያ', category: 'CROCKERY', unit: 'pcs', isReusable: true, imageUrl: '/images/materials/ramekin.jpg', description: 'Stemmed coupe dish for ice cream, puddings.', sortOrder: 44, initialOnHand: 55 },
  { code: 'MAT-CRK-025', name: 'Injera Serving Tray Ceramic 16"', amharicName: 'ትልቅ የእንጀራ ማቅረቢያ', category: 'CROCKERY', unit: 'pcs', isReusable: true, imageUrl: '/images/materials/stainless-platter.jpg', description: 'Wide shallow round platter for shared beyaynetu platter.', sortOrder: 45, initialOnHand: 50 },

  // ─── GLASSWARE & BARWARE (20 items) ───────────────────────────────
  { code: 'MAT-GLS-001', name: 'Water Goblet Glass 350ml', amharicName: 'የውሃ ብርጭቆ', category: 'GLASSWARE', unit: 'pcs', isReusable: true, imageUrl: '/images/materials/water-goblet.jpg', description: 'Stemmed universal water goblet for table setting.', sortOrder: 46, initialOnHand: 200 },
  { code: 'MAT-GLS-002', name: 'Red Wine Glass 450ml (Bordeaux)', amharicName: 'የቀይ ወይን ብርጭቆ', category: 'GLASSWARE', unit: 'pcs', isReusable: true, imageUrl: '/images/materials/red-wine-glass.jpg', description: 'Large round bowl crystal glass for full red wines.', sortOrder: 47, initialOnHand: 120 },
  { code: 'MAT-GLS-003', name: 'White Wine Glass 350ml (Chardonnay)', amharicName: 'የነጭ ወይን ብርጭቆ', category: 'GLASSWARE', unit: 'pcs', isReusable: true, imageUrl: '/images/materials/white-wine-glass.jpg', description: 'U-shaped narrower bowl glass for crisp whites.', sortOrder: 48, initialOnHand: 120 },
  { code: 'MAT-GLS-004', name: 'Champagne Flute 200ml', amharicName: 'የሻምፓኝ ብርጭቆ', category: 'GLASSWARE', unit: 'pcs', isReusable: true, imageUrl: '/images/materials/champagne-flute.jpg', description: 'Tall slim flute for sparkling wines and toasts.', sortOrder: 49, initialOnHand: 90 },
  { code: 'MAT-GLS-005', name: 'Highball / Collins Glass 330ml', amharicName: 'ረጅም የመጠጥ ብርጭቆ', category: 'GLASSWARE', unit: 'pcs', isReusable: true, imageUrl: '/images/materials/highball-glass.jpg', description: 'Straight-sided tumbler for sodas, iced tea, juices.', sortOrder: 50, initialOnHand: 180 },
  { code: 'MAT-GLS-006', name: 'Old Fashioned / Rocks Tumbler 280ml', amharicName: 'የዊስኪ ብርጭቆ', category: 'GLASSWARE', unit: 'pcs', isReusable: true, imageUrl: '/images/materials/whiskey-glass.jpg', description: 'Heavy-base short tumbler for spirits on the rocks.', sortOrder: 51, initialOnHand: 140 },
  { code: 'MAT-GLS-007', name: 'Beer Mug with Handle 500ml', amharicName: 'ትልቅ የቢራ ብርጭቆ', category: 'GLASSWARE', unit: 'pcs', isReusable: true, imageUrl: '/images/materials/beer-mug.jpg', description: 'Heavy dimpled glass beer tankard with sturdy handle.', sortOrder: 52, initialOnHand: 110 },
  { code: 'MAT-GLS-008', name: 'Pilsner Glass 400ml', amharicName: 'የቢራ ብርጭቆ', category: 'GLASSWARE', unit: 'pcs', isReusable: true, imageUrl: '/images/materials/beer-mug.jpg', description: 'Tall curved glass for lagers and pilsners.', sortOrder: 53, initialOnHand: 90 },
  { code: 'MAT-GLS-009', name: 'Martini / Cocktail Glass 220ml', amharicName: 'የማርቲኒ ብርጭቆ', category: 'GLASSWARE', unit: 'pcs', isReusable: true, imageUrl: '/images/materials/cocktail-glass.jpg', description: 'Classic inverted cone stemmed glass.', sortOrder: 54, initialOnHand: 60 },
  { code: 'MAT-GLS-010', name: 'Margarita Glass 300ml', amharicName: 'የማርጋሪታ ብርጭቆ', category: 'GLASSWARE', unit: 'pcs', isReusable: true, imageUrl: '/images/materials/cocktail-glass.jpg', description: 'Stepped bowl glass for blended cocktails.', sortOrder: 55, initialOnHand: 45 },
  { code: 'MAT-GLS-011', name: 'Heavy Base Shot Glass 50ml', amharicName: 'የሾት ብርጭቆ', category: 'GLASSWARE', unit: 'pcs', isReusable: true, imageUrl: '/images/materials/shot-glass.jpg', description: 'Commercial thick bottom shooter glass.', sortOrder: 56, initialOnHand: 150 },
  { code: 'MAT-GLS-012', name: 'Irish Coffee Glass Mug 240ml', amharicName: 'የአይሪሽ ቡና ብርጭቆ', category: 'GLASSWARE', unit: 'pcs', isReusable: true, imageUrl: '/images/materials/mug.jpg', description: 'Heat-resistant handled glass for hot toddies & specialty coffees.', sortOrder: 57, initialOnHand: 50 },
  { code: 'MAT-GLS-013', name: 'Wine Decanter / Carafe 1.0L', amharicName: 'የወይን ማቅረቢያ ካራፍ', category: 'GLASSWARE', unit: 'pcs', isReusable: true, imageUrl: '/images/materials/glass-carafe.jpg', description: 'Wide-base glass decanter for aerating red wines.', sortOrder: 58, initialOnHand: 25 },
  { code: 'MAT-GLS-014', name: 'Water / Juice Glass Carafe 1.5L', amharicName: 'የውሃ/ጁስ ካራፍ', category: 'GLASSWARE', unit: 'pcs', isReusable: true, imageUrl: '/images/materials/glass-carafe.jpg', description: 'Heavy glass pitcher with pour lip for table service.', sortOrder: 59, initialOnHand: 35 },
  { code: 'MAT-GLS-015', name: 'Stainless Ice Bucket with Tongs', amharicName: 'የበረዶ ባልዲ ከመቆንጠጫ ጋር', category: 'GLASSWARE', unit: 'set', isReusable: true, imageUrl: '/images/materials/ice-bucket.jpg', description: 'Double-walled insulated wine ice bucket with mini tongs.', sortOrder: 60, initialOnHand: 25 },
  { code: 'MAT-GLS-016', name: 'Stainless Wine Bottle Cooler', amharicName: 'የወይን ማቀዝቀዣ', category: 'GLASSWARE', unit: 'pcs', isReusable: true, imageUrl: '/images/materials/ice-bucket.jpg', description: 'Double-wall brushed stainless single-bottle chiller.', sortOrder: 61, initialOnHand: 30 },
  { code: 'MAT-GLS-017', name: 'Boston Cocktail Shaker (2-Piece)', amharicName: 'የኮክቴል ሼከር', category: 'GLASSWARE', unit: 'set', isReusable: true, imageUrl: '/images/materials/cocktail-shaker.jpg', description: 'Weighted stainless tins 28oz & 18oz for mixology.', sortOrder: 62, initialOnHand: 20 },
  { code: 'MAT-GLS-018', name: 'Stainless Japanese Jigger (25/50ml)', amharicName: 'የመጠጥ መለኪያ', category: 'GLASSWARE', unit: 'pcs', isReusable: true, imageUrl: '/images/materials/cocktail-shaker.jpg', description: 'Dual measurement spirit measure with interior markings.', sortOrder: 63, initialOnHand: 30 },
  { code: 'MAT-GLS-019', name: 'Glass Milkshake / Smoothie Glass 450ml', amharicName: 'የስሙዚ ብርጭቆ', category: 'GLASSWARE', unit: 'pcs', isReusable: true, imageUrl: '/images/materials/highball-glass.jpg', description: 'Fluted retro milkshake parlor glass.', sortOrder: 64, initialOnHand: 60 },
  { code: 'MAT-GLS-020', name: 'Mini Glass Dessert Tasting Cup 100ml', amharicName: 'ትንሽ የጣፋጭ ብርጭቆ', category: 'GLASSWARE', unit: 'pcs', isReusable: true, imageUrl: '/images/materials/shot-glass.jpg', description: 'Catering shooter cup for panna cotta and mousse.', sortOrder: 65, initialOnHand: 80 },

  // ─── TRAYS & PLATTERS (15 items) ──────────────────────────────────
  { code: 'MAT-TRY-001', name: 'Round Non-Slip Waiter Tray 14"', amharicName: 'የአስተናጋጅ ሪከርድ ትሪ 14"', category: 'TRAYS', unit: 'pcs', isReusable: true, imageUrl: '/images/materials/waiter-tray.jpg', description: 'Rubberised non-slip surface drinks tray.', sortOrder: 66, initialOnHand: 40 },
  { code: 'MAT-TRY-002', name: 'Round Non-Slip Waiter Tray 16"', amharicName: 'የአስተናጋጅ ሪከርድ ትሪ 16"', category: 'TRAYS', unit: 'pcs', isReusable: true, imageUrl: '/images/materials/waiter-tray.jpg', description: 'Heavy-duty fiberglass banquet tray.', sortOrder: 67, initialOnHand: 35 },
  { code: 'MAT-TRY-003', name: 'Oval Banquet Service Tray 27"', amharicName: 'ትልቅ ኦቫል የአስተናጋጅ ትሪ', category: 'TRAYS', unit: 'pcs', isReusable: true, imageUrl: '/images/materials/oval-tray.jpg', description: 'Large oval tray for carrying 4-6 main course plates.', sortOrder: 68, initialOnHand: 25 },
  { code: 'MAT-TRY-004', name: 'Rectangular Room Service / Outside Tray', amharicName: 'የክፍል/ውጭ ማቅረቢያ ትሪ', category: 'TRAYS', unit: 'pcs', isReusable: true, imageUrl: '/images/materials/room-service-tray.jpg', description: 'Wood-finish melamine tray with ergonomic carry handles.', sortOrder: 69, initialOnHand: 40 },
  { code: 'MAT-TRY-005', name: 'Stainless Steel Round Serving Platter 40cm', amharicName: 'የብረት ትሪ 40 ሳ.ሜ', category: 'TRAYS', unit: 'pcs', isReusable: true, imageUrl: '/images/materials/stainless-platter.jpg', description: 'Mirror-finish stainless platter for injera & tibs.', sortOrder: 70, initialOnHand: 35 },
  { code: 'MAT-TRY-006', name: 'Stainless Steel Round Serving Platter 50cm', amharicName: 'ትልቅ የብረት ትሪ 50 ሳ.ሜ', category: 'TRAYS', unit: 'pcs', isReusable: true, imageUrl: '/images/materials/stainless-platter.jpg', description: 'Family-size communal platter for 4-6 persons.', sortOrder: 71, initialOnHand: 30 },
  { code: 'MAT-TRY-007', name: 'Round Wooden Pizza Board 12" (Handle)', amharicName: 'የፒዛ እንጨት ሰሌዳ 12"', category: 'TRAYS', unit: 'pcs', isReusable: true, imageUrl: '/images/materials/wooden-pizza-board.jpg', description: 'Oiled acacia wood pizza paddle board with groove.', sortOrder: 72, initialOnHand: 35 },
  { code: 'MAT-TRY-008', name: 'Round Wooden Pizza Board 14" (Handle)', amharicName: 'የፒዛ እንጨት ሰሌዳ 14"', category: 'TRAYS', unit: 'pcs', isReusable: true, imageUrl: '/images/materials/wooden-pizza-board.jpg', description: 'Large wooden pizza board for party size.', sortOrder: 73, initialOnHand: 30 },
  { code: 'MAT-TRY-009', name: 'Natural Slate Charcuterie / Cheese Board', amharicName: 'የአይብና ስጋ ሰሌዳ', category: 'TRAYS', unit: 'pcs', isReusable: true, imageUrl: '/images/materials/cheese-board.jpg', description: 'Black slate stone platter with foam feet.', sortOrder: 74, initialOnHand: 25 },
  { code: 'MAT-TRY-010', name: 'Wire Mesh Bread Basket Oval', amharicName: 'የዳቦ ማስቀመጫ ቅርጫት', category: 'TRAYS', unit: 'pcs', isReusable: true, imageUrl: '/images/materials/bread-basket.jpg', description: 'Black coated wire bread basket with cloth liner.', sortOrder: 75, initialOnHand: 50 },
  { code: 'MAT-TRY-011', name: 'Wicker Injera Basket with Lid (Mesob Mini)', amharicName: 'ትንሽ መሶብ', category: 'TRAYS', unit: 'pcs', isReusable: true, imageUrl: '/images/materials/bread-basket.jpg', description: 'Traditional mini woven grass basket with lid for injera warmth.', sortOrder: 76, initialOnHand: 40 },
  { code: 'MAT-TRY-012', name: 'Stainless Cutlery Caddy 4-Slot', amharicName: 'የሹካና ማንኪያ ማስቀመጫ', category: 'TRAYS', unit: 'pcs', isReusable: true, imageUrl: '/images/materials/cutlery-set.jpg', description: 'Tabletop cylinder organizer for cutlery and napkins.', sortOrder: 77, initialOnHand: 35 },
  { code: 'MAT-TRY-013', name: 'Luxury Leatherette Bill Folder', amharicName: 'የሂሳብ ፎልደር', category: 'TRAYS', unit: 'pcs', isReusable: true, imageUrl: '/images/materials/bill-folder.jpg', description: 'Padded black faux leather check presenter with card clip.', sortOrder: 78, initialOnHand: 50 },
  { code: 'MAT-TRY-014', name: 'Acrylic 3-Tier Dessert Display Stand', amharicName: 'ባለ 3 ድርብ የኬክ ማቅረቢያ', category: 'TRAYS', unit: 'set', isReusable: true, imageUrl: '/images/materials/room-service-tray.jpg', description: 'Clear acrylic tiered stand for afternoon tea & pastries.', sortOrder: 79, initialOnHand: 15 },
  { code: 'MAT-TRY-015', name: 'Folding Tray Stand (Chrome)', amharicName: 'የትሪ መደገፊያ', category: 'TRAYS', unit: 'pcs', isReusable: true, imageUrl: '/images/materials/waiter-tray.jpg', description: 'Chrome tubular folding stand for waiter oval trays.', sortOrder: 80, initialOnHand: 20 },

  // ─── WARMERS & INSULATED CARRIERS (12 items) ──────────────────────
  { code: 'MAT-WRM-001', name: 'Insulated Food Delivery Backpack 45L', amharicName: 'የምግብ ማጓጓዣ ቴርማል ቦርሳ 45L', category: 'WARMERS_CARRIERS', unit: 'pcs', isReusable: true, imageUrl: '/images/materials/thermal-backpack.jpg', description: 'Thermal insulated waterproof backpack for bike/foot outside delivery.', sortOrder: 81, initialOnHand: 15 },
  { code: 'MAT-WRM-002', name: 'Insulated Food Carrier Box 60L (Rigid)', amharicName: 'ትልቅ ቴርማል ቦክስ 60L', category: 'WARMERS_CARRIERS', unit: 'pcs', isReusable: true, imageUrl: '/images/materials/insulated-box.jpg', description: 'EPP high-density insulated box for catering food pans.', sortOrder: 82, initialOnHand: 12 },
  { code: 'MAT-WRM-003', name: 'Insulated Pizza Delivery Bag 16" (4-Box)', amharicName: 'የፒዛ ማጓጓዣ ቦርሳ', category: 'WARMERS_CARRIERS', unit: 'pcs', isReusable: true, imageUrl: '/images/materials/pizza-delivery-bag.jpg', description: 'Heavy-duty breathable thermal pizza bag.', sortOrder: 83, initialOnHand: 18 },
  { code: 'MAT-WRM-004', name: 'Stainless Chafing Dish Roll-Top 9L (GN 1/1)', amharicName: 'ሮል-ቶፕ ሼፊንግ ዲሽ 9L', category: 'WARMERS_CARRIERS', unit: 'pcs', isReusable: true, imageUrl: '/images/materials/chafing-dish.jpg', description: 'Premium roll-top buffet chafing dish with burner holders.', sortOrder: 84, initialOnHand: 20 },
  { code: 'MAT-WRM-005', name: 'Stainless Round Chafing Dish 6L', amharicName: 'ክብ ሼፊንግ ዲሽ 6L', category: 'WARMERS_CARRIERS', unit: 'pcs', isReusable: true, imageUrl: '/images/materials/chafing-dish.jpg', description: 'Round glass-window chafing dish for stews and tibs.', sortOrder: 85, initialOnHand: 15 },
  { code: 'MAT-WRM-006', name: 'Electric Soup Kettle Warmer 10L', amharicName: 'የኤሌክትሪክ የሾርባ ማሞቂያ 10L', category: 'WARMERS_CARRIERS', unit: 'pcs', isReusable: true, imageUrl: '/images/materials/soup-kettle.jpg', description: 'Black powder-coated wet heat soup kettle 400W.', sortOrder: 86, initialOnHand: 10 },
  { code: 'MAT-WRM-007', name: 'Insulated Beverage Dispenser 10L with Spigot', amharicName: 'የሙቅ/ቀዝቃዛ መጠጥ ቴርሞስ 10L', category: 'WARMERS_CARRIERS', unit: 'pcs', isReusable: true, imageUrl: '/images/materials/beverage-dispenser.jpg', description: 'Double-wall stainless drink urn for coffee, tea, punch.', sortOrder: 87, initialOnHand: 12 },
  { code: 'MAT-WRM-008', name: 'Thermal Coffee Carafe Pump-Pot 3.0L', amharicName: 'የቡና ቴርሞስ 3L', category: 'WARMERS_CARRIERS', unit: 'pcs', isReusable: true, imageUrl: '/images/materials/thermal-carafe.jpg', description: 'Lever-action pump airpot flask keeps coffee hot 12 hrs.', sortOrder: 88, initialOnHand: 16 },
  { code: 'MAT-WRM-009', name: 'Thermal Soup / Food Jar Stainless 2.0L', amharicName: 'የምግብ ቴርሞስ 2L', category: 'WARMERS_CARRIERS', unit: 'pcs', isReusable: true, imageUrl: '/images/materials/thermal-carafe.jpg', description: 'Vacuum insulated wide-mouth food container with handle.', sortOrder: 89, initialOnHand: 20 },
  { code: 'MAT-WRM-010', name: 'Electric Countertop Induction Warmer Plate', amharicName: 'የኤሌክትሪክ ማሞቂያ ሳህን', category: 'WARMERS_CARRIERS', unit: 'pcs', isReusable: true, imageUrl: '/images/materials/chafing-dish.jpg', description: 'Slim glass induction holding plate for table-side heat.', sortOrder: 90, initialOnHand: 8 },
  { code: 'MAT-WRM-011', name: 'Chafing Fuel Burner Holder Set (Pair)', amharicName: 'የነዳጅ ማስቀመጫ', category: 'WARMERS_CARRIERS', unit: 'pair', isReusable: true, imageUrl: '/images/materials/chafing-dish.jpg', description: 'Stainless steel fuel can holders with damping covers.', sortOrder: 91, initialOnHand: 30 },
  { code: 'MAT-WRM-012', name: 'Cake Transport Carrier Box (Locking Lid)', amharicName: 'የኬክ ማጓጓዣ ሣጥን', category: 'WARMERS_CARRIERS', unit: 'pcs', isReusable: true, imageUrl: '/images/materials/insulated-box.jpg', description: 'Hard plastic dome cake carrier with snap-lock clips.', sortOrder: 92, initialOnHand: 15 },

  // ─── CONTAINERS & CRATES (15 items) ───────────────────────────────
  { code: 'MAT-CNT-001', name: 'Gastronorm GN 1/1 Food Pan (65mm Deep)', amharicName: 'ጋስትሮኖርም 1/1 65ሚሜ', category: 'CONTAINERS', unit: 'pcs', isReusable: true, imageUrl: '/images/materials/gn-food-pan.jpg', description: 'Standard commercial stainless catering insert pan.', sortOrder: 93, initialOnHand: 40 },
  { code: 'MAT-CNT-002', name: 'Gastronorm GN 1/1 Food Pan (100mm Deep)', amharicName: 'ጋስትሮኖርም 1/1 100ሚሜ', category: 'CONTAINERS', unit: 'pcs', isReusable: true, imageUrl: '/images/materials/gn-food-pan.jpg', description: 'Deep stainless pan for stews, rice, and bulk dishes.', sortOrder: 94, initialOnHand: 35 },
  { code: 'MAT-CNT-003', name: 'Gastronorm GN 1/2 Food Pan (65mm Deep)', amharicName: 'ጋስትሮኖርም 1/2 65ሚሜ', category: 'CONTAINERS', unit: 'pcs', isReusable: true, imageUrl: '/images/materials/gn-food-pan.jpg', description: 'Half-size stainless insert pan for sides.', sortOrder: 95, initialOnHand: 40 },
  { code: 'MAT-CNT-004', name: 'Gastronorm GN 1/1 Stainless Pan Lid with Handle', amharicName: 'የጋስትሮኖርም 1/1 ክዳን', category: 'CONTAINERS', unit: 'pcs', isReusable: true, imageUrl: '/images/materials/gn-food-pan.jpg', description: 'Recessed center handle lid for GN 1/1 pans.', sortOrder: 96, initialOnHand: 40 },
  { code: 'MAT-CNT-005', name: 'Silicone Sealing Spill-Proof Lid GN 1/1', amharicName: 'የሲሊኮን መክደኛ 1/1', category: 'CONTAINERS', unit: 'pcs', isReusable: true, imageUrl: '/images/materials/gn-food-pan.jpg', description: 'Airtight silicone suction lid prevents transit spills.', sortOrder: 97, initialOnHand: 25 },
  { code: 'MAT-CNT-006', name: 'Dishwasher Glass Rack (25 Compartments)', amharicName: 'የብርጭቆ ማጠቢያ ቅርጫት 25', category: 'CONTAINERS', unit: 'pcs', isReusable: true, imageUrl: '/images/materials/glass-rack-crate.jpg', description: 'Heavy-duty commercial glass washing & transport crate.', sortOrder: 98, initialOnHand: 25 },
  { code: 'MAT-CNT-007', name: 'Dishwasher Glass Rack (36 Compartments)', amharicName: 'የብርጭቆ ማጠቢያ ቅርጫት 36', category: 'CONTAINERS', unit: 'pcs', isReusable: true, imageUrl: '/images/materials/glass-rack-crate.jpg', description: 'Fine glassware washing crate with drop-in dividers.', sortOrder: 99, initialOnHand: 20 },
  { code: 'MAT-CNT-008', name: 'Plate Storage & Washing Peg Rack 50x50cm', amharicName: 'የሳህን ማጠቢያ ፔግ ራክ', category: 'CONTAINERS', unit: 'pcs', isReusable: true, imageUrl: '/images/materials/glass-rack-crate.jpg', description: 'Standard peg rack holds 18 large dinner plates vertically.', sortOrder: 100, initialOnHand: 30 },
  { code: 'MAT-CNT-009', name: 'Cutlery Washing Cylinder Basket 8-Compartment', amharicName: 'የሹካ ማንኪያ ማጠቢያ ቅርጫት', category: 'CONTAINERS', unit: 'pcs', isReusable: true, imageUrl: '/images/materials/cutlery-set.jpg', description: 'Perforated basket for sanitizing silverware.', sortOrder: 101, initialOnHand: 20 },
  { code: 'MAT-CNT-010', name: 'Heavy-Duty Bussing Tub 30L', amharicName: 'የቆሸሸ እቃ መሰብሰቢያ ገበታ', category: 'CONTAINERS', unit: 'pcs', isReusable: true, imageUrl: '/images/materials/bussing-tub.jpg', description: 'Commercial grey polypropylene bus box with handles.', sortOrder: 102, initialOnHand: 35 },
  { code: 'MAT-CNT-011', name: 'Clear Polycarbonate Food Storage Box 18L with Lid', amharicName: 'የምግብ ማቆያ ሳጥን 18L', category: 'CONTAINERS', unit: 'pcs', isReusable: true, imageUrl: '/images/materials/insulated-box.jpg', description: 'Shatter-proof Cambro-style box with measurement graduations.', sortOrder: 103, initialOnHand: 25 },
  { code: 'MAT-CNT-012', name: 'Heavy Duty Nestable Transport Tote 55L (Hinged Lid)', amharicName: 'የጭነት ማጓጓዣ ሣጥን 55L', category: 'CONTAINERS', unit: 'pcs', isReusable: true, imageUrl: '/images/materials/bussing-tub.jpg', description: 'Tamper-evident transport crate for banquet logistics.', sortOrder: 104, initialOnHand: 18 },
  { code: 'MAT-CNT-013', name: 'Condiment Squeeze Bottle Set (Red/Yellow/Clear)', amharicName: 'የሶስ መጭመቂያ ጠርሙስ', category: 'CONTAINERS', unit: 'set', isReusable: true, imageUrl: '/images/materials/squeeze-bottle.jpg', description: '3-pack polyethylene bottles for ketchup, mustard, oil.', sortOrder: 105, initialOnHand: 30 },
  { code: 'MAT-CNT-014', name: 'Stainless Salt & Pepper Shaker Set (Pair)', amharicName: 'የጨውና ቁንዶ በርበሬ ማስቀመጫ', category: 'CONTAINERS', unit: 'pair', isReusable: true, imageUrl: '/images/materials/salt-pepper.jpg', description: 'Glass body with stainless screw tops for tables.', sortOrder: 106, initialOnHand: 60 },
  { code: 'MAT-CNT-015', name: 'Toothpick Dispenser Automatic', amharicName: 'የጥርስ ሳሙና/እንጨት ማስቀመጫ', category: 'CONTAINERS', unit: 'pcs', isReusable: true, imageUrl: '/images/materials/salt-pepper.jpg', description: 'Sanitary press-top toothpick holder for table service.', sortOrder: 107, initialOnHand: 45 },
];

export async function seedMaterialsForTenant(
  prisma: any,
  tenantId: string,
  branches: Array<{ id: string }>,
) {
  for (const item of SEED_MATERIALS) {
    const materialId = id(`mat_${tenantId.slice(0, 8)}_${item.code.toLowerCase()}`);

    const material = await prisma.inventoryMaterial.upsert({
      where: {
        tenantId_code: {
          tenantId,
          code: item.code,
        },
      },
      update: {
        name: item.name,
        amharicName: item.amharicName,
        category: item.category,
        unit: item.unit,
        isReusable: item.isReusable,
        imageUrl: item.imageUrl,
        description: item.description,
        sortOrder: item.sortOrder,
        status: 'ACTIVE',
      },
      create: {
        id: materialId,
        tenantId,
        name: item.name,
        amharicName: item.amharicName,
        code: item.code,
        category: item.category,
        unit: item.unit,
        isReusable: item.isReusable,
        imageUrl: item.imageUrl,
        description: item.description,
        sortOrder: item.sortOrder,
        status: 'ACTIVE',
      },
    });

    for (const branch of branches) {
      const balanceId = id(`matbal_${material.id}_${branch.id}`);
      await prisma.inventoryMaterialBalance.upsert({
        where: { id: balanceId },
        update: {
          onHandQty: item.initialOnHand,
          issuedQty: 0,
          lostQty: 0,
        },
        create: {
          id: balanceId,
          tenantId,
          branchId: branch.id,
          materialId: material.id,
          onHandQty: item.initialOnHand,
          issuedQty: 0,
          lostQty: 0,
        },
      });
    }
  }
}

export async function seedMaterials(prisma: PrismaClient) {
  console.log('Seeding returnable inventory materials (107 items) across ALL tenants...');

  const tenants = await prisma.tenant.findMany({
    include: { branches: true },
  });

  for (const tenant of tenants) {
    await seedMaterialsForTenant(prisma, tenant.id, tenant.branches);
    console.log(`Seeded ${SEED_MATERIALS.length} returnable materials for tenant "${tenant.displayName}" across ${tenant.branches.length} branches.`);
  }
}
