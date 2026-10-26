import * as fs from 'fs';
import * as path from 'path';

interface ModelInfo {
  name: string;
  fields: { name: string; type: string; isId: boolean; isUnique: boolean; relationFields?: string[] }[];
  indices: string[][];
  uniques: string[][];
}

function parseSchema(filePath: string): ModelInfo[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  const models: ModelInfo[] = [];
  let currentModel: ModelInfo | null = null;

  for (let line of lines) {
    line = line.trim();
    if (line.startsWith('model ')) {
      const match = line.match(/^model\s+([A-Za-z0-9_]+)\s*\{/);
      if (match) {
        currentModel = {
          name: match[1],
          fields: [],
          indices: [],
          uniques: []
        };
        models.push(currentModel);
      }
    } else if (line.startsWith('}') && currentModel) {
      currentModel = null;
    } else if (currentModel) {
      if (line.startsWith('@@index(')) {
        const match = line.match(/@@index\(\[([^\]]+)\]/);
        if (match) {
          const cols = match[1].split(',').map(s => s.trim().replace(/^"|"$/g, ''));
          currentModel.indices.push(cols);
        }
      } else if (line.startsWith('@@unique(') || line.startsWith('@@id(')) {
        const match = line.match(/@@(?:unique|id)\(\[([^\]]+)\]/);
        if (match) {
          const cols = match[1].split(',').map(s => s.trim().replace(/^"|"$/g, ''));
          currentModel.uniques.push(cols);
        }
      } else if (line && !line.startsWith('//')) {
        // field definition
        const parts = line.split(/\s+/);
        if (parts.length >= 2) {
          const fieldName = parts[0];
          const fieldType = parts[1];
          const isId = line.includes('@id');
          const isUnique = line.includes('@unique');

          let relationFields: string[] | undefined;
          const relMatch = line.match(/@relation\([^)]*fields:\s*\[([^\]]+)\]/);
          if (relMatch) {
            relationFields = relMatch[1].split(',').map(s => s.trim());
          }

          currentModel.fields.push({
            name: fieldName,
            type: fieldType,
            isId,
            isUnique,
            relationFields
          });
        }
      }
    }
  }

  return models;
}

function checkLeadingIndex(): void {
  const schemaPath = path.join(process.cwd(), 'prisma', 'schema.prisma');
  const models = parseSchema(schemaPath);
  let errors = 0;

  for (const model of models) {
    for (const field of model.fields) {
      if (field.relationFields && field.relationFields.length > 0) {
        const fkFields = field.relationFields;
        const leadingFk = fkFields[0];

        // Check if there is an index or unique constraint with leadingFk as the first column
        const singleFieldUnique = model.fields.some(f => f.name === leadingFk && (f.isId || f.isUnique));
        const indexCovered = model.indices.some(cols => cols[0] === leadingFk);
        const compoundUniqueCovered = model.uniques.some(cols => cols[0] === leadingFk);

        if (!singleFieldUnique && !indexCovered && !compoundUniqueCovered) {
          console.error(`❌ Model ${model.name}: relation field ${field.name} with foreign key [${fkFields.join(', ')}] lacks a leading index or unique constraint!`);
          errors++;
        }
      }
    }
  }

  if (errors > 0) {
    console.error(`Found ${errors} foreign key(s) missing leading indexes!`);
    process.exit(1);
  }

  console.log('✅ All relation foreign keys have a leading index or unique constraint.');
}

checkLeadingIndex();
