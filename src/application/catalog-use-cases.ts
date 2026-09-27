import type { CatalogService } from "../services/catalog-service.js";

/** Casos de uso de solo lectura para el catálogo comercial. */
export class CatalogUseCases {
  constructor(private readonly catalog: CatalogService) {}

  list() {
    return this.catalog.priceList();
  }

  search(input: { model?: string; flavor?: string }) {
    if (input.model && input.flavor) {
      return this.catalog.specific(input.model, input.flavor);
    }
    if (input.model) return this.catalog.byModel(input.model);
    if (input.flavor) return this.catalog.byFlavor(input.flavor);
    return this.catalog.priceList();
  }
}
