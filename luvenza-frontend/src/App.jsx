import { Navigate, Route, Routes } from "react-router-dom";
import ProtectedRoute from "./components/ProtectedRoute";
import AppLayout from "./layouts/AppLayout";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import Unauthorized from "./pages/Unauthorized";
import { Shop,Measurements,Customizations,CustomerOrders } from "./pages/CustomerPages";
import { AdminOrders,AdminCustomers,AdminTailors,AdminDeliveryPartners,AdminCustomizations,AdminCollections,AdminComponents,AdminTemplates } from "./pages/AdminPages";
import { TailorOrders,DeliveryOrders,ProfilePage,Availability,MonthlyReport } from "./pages/StaffPages";

export default function App(){
 return <Routes>
  <Route path="/" element={<Navigate to="/login" replace/>}/>
  <Route path="/login" element={<Login/>}/>
  <Route path="/register" element={<Register/>}/>
  <Route path="/unauthorized" element={<Unauthorized/>}/>
  <Route element={<ProtectedRoute/>}>
   <Route path="/app" element={<AppLayout/>}>
    <Route index element={<Dashboard/>}/>
    <Route element={<ProtectedRoute roles={["customer"]}/>}>
     <Route path="shop" element={<Shop/>}/>
     <Route path="customizations" element={<Customizations/>}/>
     <Route path="measurements" element={<Measurements/>}/>
     <Route path="orders" element={<CustomerOrders/>}/>
     <Route path="profile" element={<ProfilePage kind="customer"/>}/>
    </Route>
    <Route element={<ProtectedRoute roles={["admin"]}/>}>
     <Route path="admin/orders" element={<AdminOrders/>}/>
     <Route path="admin/customers" element={<AdminCustomers/>}/>
     <Route path="admin/tailors" element={<AdminTailors/>}/>
     <Route path="admin/delivery-partners" element={<AdminDeliveryPartners/>}/>
     <Route path="admin/customizations" element={<AdminCustomizations/>}/>
     <Route path="admin/collections" element={<AdminCollections/>}/>
     <Route path="admin/design-components" element={<AdminComponents/>}/>
     <Route path="admin/templates" element={<AdminTemplates/>}/>
    </Route>
    <Route element={<ProtectedRoute roles={["tailor"]}/>}>
     <Route path="tailor/orders" element={<TailorOrders/>}/>
     <Route path="tailor/profile" element={<ProfilePage kind="tailor"/>}/>
     <Route path="tailor/availability" element={<Availability/>}/>
     <Route path="tailor/reports" element={<MonthlyReport kind="tailor"/>}/>
    </Route>
    <Route element={<ProtectedRoute roles={["deliver_partner"]}/>}>
     <Route path="delivery/orders" element={<DeliveryOrders/>}/>
     <Route path="delivery/profile" element={<ProfilePage kind="delivery"/>}/>
     <Route path="delivery/availability" element={<Availability/>}/>
     <Route path="delivery/reports" element={<MonthlyReport kind="delivery"/>}/>
    </Route>
   </Route>
  </Route>
  <Route path="*" element={<Navigate to="/login" replace/>}/>
 </Routes>;
}
