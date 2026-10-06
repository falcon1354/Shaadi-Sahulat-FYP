import React from 'react';
import { Calculator } from 'lucide-react';
import Wizard from './Wizard';
import BuyerPageHero from '../Common/BuyerPageHero';
import budgetHeroImg from '../../assets/hero/Buyer_Budget.jpg';

export default function DowryPage({ userId }) {
  return (
    <div className="animate-fade-in space-y-6">
      <BuyerPageHero
        badge={<><Calculator size={13} /> Dowry Planning</>}
        title="Dowry Budget Estimation"
        subtitle="Get a personalized dowry budget estimate. Enter your financial and family details to get started."
        image={budgetHeroImg}
        imageAlt="Wedding budget planning still life"
      />
      <Wizard userId={userId} />
    </div>
  );
}
