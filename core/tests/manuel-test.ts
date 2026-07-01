import { Registry } from '../src/domain/registry.js';
import { Graph } from '../src/domain/graph.js';
import { DefinitionLoader } from '../src/infrastructure/file-system/definition-loader.js';
import { ValidateProposalUseCase } from '../src/application/validate-proposal.use-case.js';
import { RuleEngine } from '../src/domain/rule-engine.js';
import path from 'path';
import { randomUUID } from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function run() {
  console.log('🧪 Démarrage du Test Manuel...\n');

  // 1. Initialisation
  const registry = new Registry();
  const graph = new Graph();
  const loader = new DefinitionLoader(path.join(__dirname, '../../definitions'));
  
  // 2. Chargement
  console.log('📂 Chargement des définitions...');
  await loader.loadAll(registry);
  console.log(`✅ ${registry.getAll().length} définitions chargées.\n`);

  // 3. Test de Listing pour l'IA
  console.log('🤖 Context pour le Prompt IA :');
  const promptContext = registry.toPromptContext();
  console.log(promptContext.slice(0, 500) + '...\n');

  // 4. Test de Validation (Proposal)
  const ruleEngine = new RuleEngine(registry, graph);
  const validator = new ValidateProposalUseCase(ruleEngine, graph);

  console.log('⚡ Test 1 : Création Node Valide');
  const validProposal = {
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    author: 'Test Script',
    operations: [{
      op: 'add_node' as const,
      payload: { 
        id: randomUUID(),
        typeId: 'tech:database:postgres',
        label: 'Main Database',
        position: { x: 0, y: 0 },
        data: { host: 'localhost', port: 5432, database: 'mydb' }
      }
    }]
  };
  const validResult = validator.execute(validProposal);
  console.log('Résultat :', validResult.valid ? '✅ VALIDE' : '❌ INVALIDE');
  if (!validResult.valid && validResult.errors) {
    console.log('Erreurs :', validResult.errors);
  }

  console.log('\n⚡ Test 2 : Création Type Inconnu');
  const invalidProposal = {
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    author: 'Test Script',
    operations: [{
      op: 'add_node' as const,
      payload: { 
        id: randomUUID(),
        typeId: 'tech:magic:unicorn', // N'existe pas
        label: 'Unicorn Service',
        position: { x: 0, y: 0 },
        data: {}
      }
    }]
  };
  
  try {
    const invalidResult = validator.execute(invalidProposal);
    if (!invalidResult.valid) {
      console.log('Résultat : ✅ INVALIDE COMME ATTENDU');
      console.log('Erreurs :', JSON.stringify(invalidResult.errors, null, 2));
    } else {
      console.log('Résultat : ❌ DEVRAIT ÊTRE INVALIDE');
    }
  } catch (e: any) {
    // C'est normal que ça lève une exception car le type n'existe pas dans le Registry
    console.log('Résultat : ✅ EXCEPTION ATTRAPÉE (comportement attendu)');
    console.log('Code d\'erreur :', e.code || 'ERR_DEFINITION_NOT_FOUND');
    console.log('Message :', e.message);
  }

  console.log('\n⚡ Test 3 : Node sans champs requis');
  const missingFieldsProposal = {
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    author: 'Test Script',
    operations: [{
      op: 'add_node' as const,
      payload: { 
        id: randomUUID(),
        typeId: 'tech:database:postgres',
        label: 'Incomplete DB',
        position: { x: 0, y: 0 },
        data: {} // Manque host, port, database (champs requis)
      }
    }]
  };
  const missingResult = validator.execute(missingFieldsProposal);
  console.log('Résultat :', missingResult.valid ? '❌ DEVRAIT ÊTRE INVALIDE' : '✅ INVALIDE COMME ATTENDU');
  if (!missingResult.valid && missingResult.errors) {
    console.log('Erreurs :', JSON.stringify(missingResult.errors, null, 2));
  }

  console.log('\n✅ Tests terminés !');
}

run().catch(console.error);