import React, { useState } from 'react';
import { useChartStore } from '@/stores/chartStore';
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CRYPTO_SYMBOLS } from '@/lib/cryptoSymbols';

interface SymbolSearchProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const SymbolSearch: React.FC<SymbolSearchProps> = ({ open, onOpenChange }) => {
  const [search, setSearch] = useState('');
  const symbol = useChartStore((s) => s.symbol);
  const setSymbol = useChartStore((s) => s.setSymbol);
  const favorites = useChartStore((s) => s.favorites);
  const toggleFavorite = useChartStore((s) => s.toggleFavorite);

  const filtered = CRYPTO_SYMBOLS.filter((s) => 
    s.toLowerCase().includes(search.toLowerCase())
  );

  const favoriteSymbols = filtered.filter((s) => favorites.includes(s));
  const otherSymbols = filtered.filter((s) => !favorites.includes(s));

  const handleSelect = (selectedSymbol: string) => {
    setSymbol(selectedSymbol);
    onOpenChange(false);
    setSearch('');
  };

  const handleToggleFavorite = (e: React.MouseEvent, sym: string) => {
    e.stopPropagation();
    toggleFavorite(sym);
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput 
        placeholder="Search symbols..." 
        value={search}
        onValueChange={setSearch}
      />
      <CommandList>
        <CommandEmpty>No symbols found.</CommandEmpty>
        
        {favoriteSymbols.length > 0 && (
          <CommandGroup heading="Favorites">
            {favoriteSymbols.map((sym) => (
              <CommandItem
                key={sym}
                value={sym}
                onSelect={() => handleSelect(sym)}
                className={cn(
                  "flex items-center justify-between cursor-pointer",
                  sym === symbol && "bg-accent"
                )}
              >
                <span>{sym}</span>
                <button
                  onClick={(e) => handleToggleFavorite(e, sym)}
                  className="ml-auto p-1 hover:bg-accent/50 rounded"
                >
                  <Star className="h-4 w-4 fill-primary text-primary" />
                </button>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        <CommandGroup heading="All Symbols">
          {otherSymbols.map((sym) => (
            <CommandItem
              key={sym}
              value={sym}
              onSelect={() => handleSelect(sym)}
              className={cn(
                "flex items-center justify-between cursor-pointer",
                sym === symbol && "bg-accent"
              )}
            >
              <span>{sym}</span>
              <button
                onClick={(e) => handleToggleFavorite(e, sym)}
                className="ml-auto p-1 hover:bg-accent/50 rounded"
              >
                <Star className="h-4 w-4 text-muted-foreground" />
              </button>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
};
